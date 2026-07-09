"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { attendeeSubmissionSchema } from "@/lib/attend/schemas";
import { scoreQuiz, type AttendeeAnswer } from "@/lib/attend/scoring";
import { decideAttempt } from "@/lib/attend/lockout";
import { issueCertificateTx, CertBalanceExhaustedError } from "@/lib/attend/issue";
import { rateLimit } from "@/lib/rate-limit";
import { appBaseUrl } from "@/lib/app-url";
import { renderCertificatePdf } from "@/lib/pdf/certificate";
import { uploadToStorage } from "@/lib/storage";
import { sendEmail } from "@/lib/email/send";
import { signCertClaimToken } from "@/lib/protrack/cert-claim-token";
import CertificateIssuedEmail from "@/emails/certificate-issued";
import { quizQuestionSchema, type QuizQuestion } from "@/lib/forms/application/schemas";

/*
  Public attendee submission. Validates input, rate-limits per IP+token, scores
  the quiz server-side, enforces one-retake lockout, and on a pass issues a
  certificate inside a FOR UPDATE transaction on the company row. PDF render +
  upload + email happen AFTER the tx commits and never roll back the issued
  cert (mirrors the reviewer approve flow).
*/

const quizArraySchema = z.array(quizQuestionSchema).length(5);

/** Thrown inside the issue tx when a passing cert already exists for this
 *  (course, email) — the concurrent-double-submit guard. Maps to already_certified. */
class AlreadyCertifiedError extends Error {
  constructor() {
    super("already certified");
    this.name = "AlreadyCertifiedError";
  }
}

export type AttendResult =
  | { status: "passed"; certificateId: string }
  | { status: "failed"; correct: boolean[]; canRetake: boolean; correctAnswers?: CorrectAnswer[] }
  | { status: "locked_out" }
  | { status: "already_certified" }
  | { status: "rate_limited"; retryAfterMs: number }
  | { status: "balance_exhausted" }
  | { status: "course_inactive" }
  | { status: "invalid" };

export type CorrectAnswer =
  | { type: "TF"; correctAnswer: "True" | "False" }
  | { type: "MC"; correctIndex: number };

function correctAnswersFor(questions: QuizQuestion[]): CorrectAnswer[] {
  return questions.map((q) =>
    q.type === "TF"
      ? { type: "TF", correctAnswer: q.correctAnswer }
      : { type: "MC", correctIndex: q.correctIndex },
  );
}

export async function submitAttendance(input: unknown): Promise<AttendResult> {
  const parsed = attendeeSubmissionSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const sub = parsed.data;
  const email = sub.attendeeEmail.toLowerCase();
  // Attendee-entered course completion date. Parsed at noon so the calendar
  // date is stable regardless of server timezone. Drives the cert + ProTrack.
  const completedAt = new Date(`${sub.completionDate}T12:00:00`);

  // Rate limit: 5 submissions / 10 min per IP+token.
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const limit = rateLimit(`attend:${ip}:${sub.token}`, { limit: 5, windowMs: 10 * 60 * 1000 });
  if (!limit.ok) return { status: "rate_limited", retryAfterMs: limit.retryAfterMs };

  const course = await prisma.accreditedCourse.findUnique({
    where: { attendeeLinkToken: sub.token },
    select: {
      id: true,
      companyId: true,
      courseIdNumber: true,
      expiresAt: true,
      quizQuestions: true,
      application: {
        select: { courseTitle: true, ceHours: true, courseType: true, deliveryMethod: true },
      },
    },
  });
  if (!course || course.expiresAt < new Date()) return { status: "course_inactive" };

  const quizParsed = quizArraySchema.safeParse(course.quizQuestions);
  if (!quizParsed.success) return { status: "course_inactive" };
  const questions = quizParsed.data;

  // The attendee's chosen Course Format becomes the certificate's deliveryMethod
  // (drives the cert's "Course Format" line + ProTrack sync). Falls back to the
  // course's declared format if somehow absent (the schema requires it).
  const certFormat = sub.courseFormat ?? course.application.deliveryMethod;

  // Prior attempts for (course, lowercased email).
  const prior = await prisma.issuedCertificate.findMany({
    where: { courseId: course.id, attendeeEmail: { equals: email, mode: "insensitive" } },
    select: { passed: true },
  });
  const decision = decideAttempt({
    passedExists: prior.some((p) => p.passed),
    failedCount: prior.filter((p) => !p.passed).length,
  });
  if (decision.kind === "already_certified") return { status: "already_certified" };
  if (decision.kind === "locked_out") return { status: "locked_out" };

  const scored = scoreQuiz(questions, sub.answers as AttendeeAnswer[]);

  // FAIL path — record the attempt, never touch the balance.
  if (!scored.passed) {
    await prisma.issuedCertificate.create({
      data: {
        courseId: course.id,
        companyId: course.companyId,
        attendeeName: sub.attendeeName,
        attendeeEmail: email,
        licenseNumber: sub.licenseNumber ?? null,
        licenseType: sub.licenseType ?? null,
        licenseStates: sub.licenseStates,
        deliveryMethod: certFormat,
        courseType: course.application.courseType,
        quizResponses: sub.answers,
        score: scored.score,
        passed: false,
        completedAt,
      },
    });
    const canRetake = !decision.isFinalAttempt;
    return {
      status: "failed",
      correct: scored.correct,
      canRetake,
      correctAnswers: canRetake ? undefined : correctAnswersFor(questions),
    };
  }

  // PASS path — issue inside a FOR UPDATE transaction on the company row.
  let certificateId: string;
  try {
    certificateId = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select id from public.companies where id = ${course.companyId}::uuid for update`;
      // Re-assert single-issue UNDER the company row lock. The pre-tx eligibility
      // read (above) races with a concurrent submit by the same attendee; because
      // a course belongs to exactly one company, both submits serialize on this
      // FOR UPDATE lock, so the loser sees the winner's committed passing row here
      // and aborts instead of issuing a second cert + double-decrementing balance.
      const alreadyPassed = await tx.issuedCertificate.findFirst({
        where: {
          courseId: course.id,
          attendeeEmail: { equals: email, mode: "insensitive" },
          passed: true,
        },
        select: { id: true },
      });
      if (alreadyPassed) throw new AlreadyCertifiedError();
      const cert = await issueCertificateTx(tx, {
        courseId: course.id,
        companyId: course.companyId,
        attendeeName: sub.attendeeName,
        attendeeEmail: email,
        licenseNumber: sub.licenseNumber ?? null,
        licenseType: sub.licenseType ?? null,
        licenseStates: sub.licenseStates,
        deliveryMethod: certFormat,
        courseType: course.application.courseType,
        quizResponses: sub.answers,
        score: scored.score,
        completedAt,
      });
      return cert.id;
    });
  } catch (err) {
    if (err instanceof AlreadyCertifiedError) return { status: "already_certified" };
    if (err instanceof CertBalanceExhaustedError) return { status: "balance_exhausted" };
    throw err;
  }

  // Post-commit delivery is staged, best-effort, and never throws: the cert
  // already exists and is downloadable from the company log. Each stage is
  // isolated so a PDF-render / storage / persist failure can no longer silently
  // suppress the certificate email — the attendee still gets the verify +
  // ProTrack claim links (just without the attachment).
  const pdfPath = `${certificateId}.pdf`;

  // 1. Render the certificate PDF. On failure keep pdf null and press on.
  let pdf: Buffer | null = null;
  try {
    pdf = await renderCertificatePdf({
      attendeeName: sub.attendeeName,
      courseTitle: course.application.courseTitle ?? "Accredited Course",
      courseIdNumber: course.courseIdNumber,
      certificateId,
      ceHours: Number(course.application.ceHours ?? 0),
      completedAt,
      deliveryMethod: certFormat,
    });
  } catch (err) {
    console.error("[submitAttendance] cert PDF render failed", err);
  }

  // 2. Upload + persist the storage URL. Must NOT block the email — we still
  //    hold the pdf bytes for the attachment and the links.
  if (pdf) {
    try {
      await uploadToStorage({ kind: "certs", path: pdfPath, body: pdf, contentType: "application/pdf" });
      await prisma.issuedCertificate.update({
        where: { id: certificateId },
        data: { certPdfUrl: pdfPath },
      });
    } catch (err) {
      console.error("[submitAttendance] cert PDF storage/persist failed", err);
    }
  }

  // 3. Send the certificate email in its own try so a send failure is
  //    individually greppable. Email props are independent of storage.
  const appBase = appBaseUrl();
  const emailProps = {
    attendeeName: sub.attendeeName,
    courseTitle: course.application.courseTitle ?? "Accredited Course",
    courseIdNumber: course.courseIdNumber,
    certificateId,
    ceHours: Number(course.application.ceHours ?? 0),
    completedAt: completedAt.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    verifyUrl: `${appBase}/attend/${sub.token}`,
    // Signed claim link (mailed only to attendeeEmail, so clicking it proves
    // inbox control). Adds this cert to the matching ProTrack account, or
    // routes to sign-up if none exists yet. See app/api/protrack/claim-certificate.
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
        ? [{ filename: `${course.courseIdNumber}-certificate.pdf`, content: pdf }]
        : undefined,
    });
  } catch (err) {
    console.error(`[submitAttendance] cert email send FAILED to ${sub.attendeeEmail}`, err);
  }

  return { status: "passed", certificateId };
}
