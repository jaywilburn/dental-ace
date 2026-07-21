"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { eventAttendeeSubmissionSchema } from "@/lib/attend/event-schemas";
import { flattenFieldErrors } from "@/lib/attend/schemas";
import { loadEventByToken, assembleForSubmit } from "@/lib/attend/event-quiz";
import { scoreEventQuiz, creditSessions } from "@/lib/attend/event-scoring";
import type { AttendeeAnswer } from "@/lib/attend/scoring";
import { decideAttempt } from "@/lib/attend/lockout";
import { issueEventCertificateTx } from "@/lib/attend/event-issue";
import { CertBalanceExhaustedError } from "@/lib/attend/issue";
import { rateLimit } from "@/lib/rate-limit";
import { appBaseUrl } from "@/lib/app-url";
import { renderEventCertificatePdf } from "@/lib/pdf/event-certificate";
import { uploadToStorage } from "@/lib/storage";
import { sendEmail } from "@/lib/email/send";
import { signCertClaimToken } from "@/lib/protrack/cert-claim-token";
import CertificateIssuedEmail from "@/emails/certificate-issued";

/*
  Public event attendee submission. Mirrors lib/attend/actions.ts submitAttendance
  but assembles a variable-length quiz (lib/attend/event-quiz.ts), scores at the
  type's threshold (event-scoring.ts) or per session for SELECTIVE_INLINE
  (creditSessions), and issues exactly ONE event certificate.
*/

class AlreadyCertifiedError extends Error {
  constructor() {
    super("already certified");
    this.name = "AlreadyCertifiedError";
  }
}

export type EventAttendResult =
  | { status: "passed"; certificateId: string }
  | { status: "failed"; correct: boolean[]; canRetake: boolean }
  | { status: "locked_out" }
  | { status: "already_certified" }
  | { status: "rate_limited"; retryAfterMs: number }
  | { status: "balance_exhausted" }
  | { status: "event_inactive" }
  | { status: "invalid"; fieldErrors: Record<string, string[]> };

export async function submitEventAttendance(input: unknown): Promise<EventAttendResult> {
  const parsed = eventAttendeeSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = flattenFieldErrors(parsed.error);
    // Field names + static schema messages only, never submitted values.
    console.error("[submitEventAttendance] invalid submission", JSON.stringify(fieldErrors));
    return { status: "invalid", fieldErrors };
  }
  const sub = parsed.data;
  const email = sub.attendeeEmail.toLowerCase();
  // Parsed at noon UTC so the calendar date is stable regardless of server
  // timezone (matches the legacy-migration rows).
  const completedAt = new Date(`${sub.completionDate}T12:00:00Z`);
  // The attendee's chosen Course Format becomes the event certificate's
  // deliveryMethod. A stale pre-deploy client bundle may omit it; fall back to
  // the event's live format.
  const certFormat = sub.courseFormat ?? "LIVE In Person";

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const limit = rateLimit(`attend-event:${ip}:${sub.token}`, { limit: 5, windowMs: 10 * 60 * 1000 });
  if (!limit.ok) return { status: "rate_limited", retryAfterMs: limit.retryAfterMs };

  const event = await loadEventByToken(sub.token);
  if (!event || event.status !== "APPROVED" || event.expiresAt === null || event.expiresAt < new Date()) {
    return { status: "event_inactive" };
  }
  if (event.company.certBalance <= 0) return { status: "balance_exhausted" };

  const assembled = assembleForSubmit(event, sub.selectedSessionIds);
  if (!assembled || assembled.questions.length !== sub.answers.length) {
    return {
      status: "invalid",
      fieldErrors: {
        answers: ["Your answers did not match the selected sessions. Please review your selections and answers."],
      },
    };
  }

  // Prior attempts for (event, email).
  const prior = await prisma.issuedCertificate.findMany({
    where: { eventId: event.id, attendeeEmail: { equals: email, mode: "insensitive" } },
    select: { passed: true },
  });
  const decision = decideAttempt({
    passedExists: prior.some((p) => p.passed),
    failedCount: prior.filter((p) => !p.passed).length,
  });
  if (decision.kind === "already_certified") return { status: "already_certified" };
  if (decision.kind === "locked_out") return { status: "locked_out" };

  const scored = scoreEventQuiz(assembled.questions, sub.answers as AttendeeAnswer[], assembled.passPct);

  // SELECTIVE_INLINE events credit each attended session individually: a
  // correct answer earns that session's hours, a wrong answer drops the session
  // from the certificate. Pass = at least one credited session; the cert's
  // hours, session ids, and session list cover only credited sessions. All
  // other types keep the single overall threshold and full attended values.
  let passed = scored.passed;
  let certHours = assembled.hours;
  let certSessionIds = assembled.attendedSessionIds;
  let certSessionNames = assembled.sessionNames;
  if (assembled.perSessionCredit) {
    const credit = creditSessions(scored.correct, assembled.sessionHours);
    passed = credit.passed;
    certHours = credit.creditedHours;
    certSessionIds = credit.creditedIndices.map((i) => assembled.attendedSessionIds[i]);
    certSessionNames = credit.creditedIndices.map((i) => assembled.sessionNames[i]);
  }

  // FAIL — record the attempt; never touch the balance. The failed row keeps
  // the ATTENDED hours/sessions (the attempt), not the credited ones.
  if (!passed) {
    await prisma.issuedCertificate.create({
      data: {
        eventId: event.id,
        courseId: null,
        companyId: event.companyId,
        attendeeName: sub.attendeeName,
        attendeeEmail: email,
        licenseNumber: sub.licenseNumber ?? null,
        licenseType: sub.licenseType ?? null,
        licenseStates: sub.licenseStates,
        deliveryMethod: certFormat,
        quizResponses: sub.answers,
        score: scored.score,
        passed: false,
        ceHours: assembled.hours,
        attendedSessionIds: assembled.attendedSessionIds,
        completedAt,
      },
    });
    return { status: "failed", correct: scored.correct, canRetake: !decision.isFinalAttempt };
  }

  // PASS — issue under a FOR UPDATE lock on the company row.
  let certificateId: string;
  try {
    certificateId = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select id from public.companies where id = ${event.companyId}::uuid for update`;
      const alreadyPassed = await tx.issuedCertificate.findFirst({
        where: { eventId: event.id, attendeeEmail: { equals: email, mode: "insensitive" }, passed: true },
        select: { id: true },
      });
      if (alreadyPassed) throw new AlreadyCertifiedError();
      const cert = await issueEventCertificateTx(tx, {
        eventId: event.id,
        companyId: event.companyId,
        attendeeName: sub.attendeeName,
        attendeeEmail: email,
        licenseNumber: sub.licenseNumber ?? null,
        licenseType: sub.licenseType ?? null,
        licenseStates: sub.licenseStates,
        deliveryMethod: certFormat,
        quizResponses: sub.answers,
        score: scored.score,
        ceHours: certHours,
        attendedSessionIds: certSessionIds,
        completedAt,
      });
      return cert.id;
    });
  } catch (err) {
    if (err instanceof AlreadyCertifiedError) return { status: "already_certified" };
    if (err instanceof CertBalanceExhaustedError) return { status: "balance_exhausted" };
    throw err;
  }

  // Post-commit delivery is staged, best-effort, and never throws: the event
  // cert already exists and is downloadable from the company log. Each stage is
  // isolated so a PDF-render / storage / persist failure can no longer silently
  // suppress the certificate email — the attendee still gets the verify +
  // ProTrack claim links (just without the attachment).
  const pdfPath = `${certificateId}.pdf`;

  // 1. Render the event certificate PDF. On failure keep pdf null and press on.
  let pdf: Buffer | null = null;
  try {
    pdf = await renderEventCertificatePdf({
      attendeeName: sub.attendeeName,
      eventName: event.name,
      eventIdNumber: event.eventIdNumber ?? "ACE-EVT",
      certificateId,
      ceHours: certHours,
      completedAt,
      // Credited sessions only on the per-session-credit path; otherwise the
      // attended list (unchanged for the other types).
      sessions: certSessionNames,
      // Matches the deliveryMethod written to the event cert row
      // (event-issue.ts / the FAIL path above): the attendee's chosen format.
      deliveryMethod: certFormat,
      licenseNumber: sub.licenseNumber ?? null,
    });
  } catch (err) {
    console.error("[submitEventAttendance] cert PDF render failed", err);
  }

  // 2. Upload + persist the storage URL. Must NOT block the email — we still
  //    hold the pdf bytes for the attachment and the links.
  if (pdf) {
    try {
      await uploadToStorage({ kind: "certs", path: pdfPath, body: pdf, contentType: "application/pdf" });
      await prisma.issuedCertificate.update({ where: { id: certificateId }, data: { certPdfUrl: pdfPath } });
    } catch (err) {
      console.error("[submitEventAttendance] cert PDF storage/persist failed", err);
    }
  }

  // 3. Send the certificate email in its own try so a send failure is
  //    individually greppable. Email props are independent of storage.
  const appBase = appBaseUrl();
  const emailProps = {
    attendeeName: sub.attendeeName,
    courseTitle: event.name,
    courseIdNumber: event.eventIdNumber ?? "ACE-EVT",
    certificateId,
    ceHours: certHours,
    completedAt: completedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }),
    verifyUrl: `${appBase}/attend/event/${sub.token}`,
    // Signed claim link (mailed only to attendeeEmail, so clicking it proves
    // inbox control). Replaces the old auto-push into any matching account,
    // which trusted a self-reported email. See app/api/protrack/claim-certificate.
    claimUrl: `${appBase}/api/protrack/claim-certificate?token=${signCertClaimToken(certificateId)}`,
  };
  try {
    await sendEmail({
      // RAW entered address — the lowercased `email` copy is for DB
      // storage/dedupe only and must never become the recipient.
      to: sub.attendeeEmail,
      subject: CertificateIssuedEmail.subject(emailProps),
      react: CertificateIssuedEmail(emailProps),
      attachments: pdf
        ? [{ filename: `${event.eventIdNumber ?? "event"}-certificate.pdf`, content: pdf }]
        : undefined,
    });
  } catch (err) {
    console.error(`[submitEventAttendance] cert email send FAILED to ${sub.attendeeEmail}`, err);
  }

  return { status: "passed", certificateId };
}
