"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { attendeeSubmissionSchema } from "@/lib/attend/schemas";
import { scoreQuiz, type AttendeeAnswer } from "@/lib/attend/scoring";
import { decideAttempt } from "@/lib/attend/lockout";
import { issueCertificateTx, CertBalanceExhaustedError } from "@/lib/attend/issue";
import { rateLimit } from "@/lib/rate-limit";
import { renderCertificatePdf } from "@/lib/pdf/certificate";
import { uploadToStorage } from "@/lib/storage";
import { sendEmail } from "@/lib/email/send";
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
        deliveryMethod: course.application.deliveryMethod,
        courseType: course.application.courseType,
        quizResponses: sub.answers,
        score: scored.score,
        passed: false,
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
        deliveryMethod: course.application.deliveryMethod,
        courseType: course.application.courseType,
        quizResponses: sub.answers,
        score: scored.score,
      });
      return cert.id;
    });
  } catch (err) {
    if (err instanceof AlreadyCertifiedError) return { status: "already_certified" };
    if (err instanceof CertBalanceExhaustedError) return { status: "balance_exhausted" };
    throw err;
  }

  // Post-commit: render PDF, upload, persist URL, email. Failures are logged,
  // not fatal — the cert exists and is downloadable from the company log.
  const completedAt = new Date();
  const pdfPath = `${certificateId}.pdf`;
  try {
    const pdf = await renderCertificatePdf({
      attendeeName: sub.attendeeName,
      courseTitle: course.application.courseTitle ?? "Accredited Course",
      courseIdNumber: course.courseIdNumber,
      certificateId,
      ceHours: Number(course.application.ceHours ?? 0),
      completedAt,
    });
    await uploadToStorage({ kind: "certs", path: pdfPath, body: pdf, contentType: "application/pdf" });
    await prisma.issuedCertificate.update({
      where: { id: certificateId },
      data: { certPdfUrl: pdfPath },
    });

    const appBase = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
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
    };
    await sendEmail({
      to: sub.attendeeEmail,
      subject: CertificateIssuedEmail.subject(emailProps),
      react: CertificateIssuedEmail(emailProps),
      attachments: [{ filename: `${course.courseIdNumber}-certificate.pdf`, content: pdf }],
    });
  } catch (err) {
    console.error("[submitAttendance] post-issue PDF/email failed", err);
  }

  return { status: "passed", certificateId };
}
