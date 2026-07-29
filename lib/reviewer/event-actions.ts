"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { appBaseUrl } from "@/lib/app-url";
import { uploadToStorage } from "@/lib/storage";
import { renderApprovalLetterPdf } from "@/lib/pdf/approval-letter";
import { renderQrPng } from "@/lib/qrcode";
import { sendEmail } from "@/lib/email/send";
import ApplicationApprovedEmail from "@/emails/application-approved";
import ApplicationRejectedEmail from "@/emails/application-rejected";
import { formatEventId, nextSeqFromLast } from "@/lib/reviewer/event-id";
import {
  isEventOnly,
  eventSessionApplicationReadSchema,
} from "@/lib/forms/event/schemas";
import { accreditApplicationTx, renderCourseAssets } from "@/lib/reviewer/accredit";
import { getLetterSignatory } from "@/lib/admin/letter-settings";

/*
  Approve / reject server actions for events, mirroring lib/reviewer/actions.ts.
  Approve allocates the Event ID under a year-scoped advisory lock (a distinct
  two-arg lock namespace from courses), flips the event to APPROVED, then renders
  + uploads the event QR and approval letter and emails the company. No credit is
  consumed here (it was taken at submit for event-level types).
*/

async function requireReviewer() {
  const user = await getCurrentUser();
  if (!user || (user.staffRole !== "REVIEWER" && user.staffRole !== "ADMIN")) {
    redirect("/login");
  }
  return user;
}

async function nextEventIdNumber(
  tx: Prisma.TransactionClient,
  year: number,
): Promise<string> {
  const prefix = `ACE-EVT-${year}-`;
  const last = await tx.event.findFirst({
    where: { eventIdNumber: { startsWith: prefix } },
    orderBy: { eventIdNumber: "desc" },
    select: { eventIdNumber: true },
  });
  return formatEventId(year, nextSeqFromLast(last?.eventIdNumber ?? null));
}

export async function approveEvent(formData: FormData) {
  const reviewer = await requireReviewer();
  const eventId = String(formData.get("eventId") ?? "");
  const reviewerNotes = String(formData.get("reviewerNotes") ?? "");
  if (!eventId) throw new Error("eventId required");

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      company: {
        select: { id: true, name: true, users: { select: { email: true }, take: 1 } },
      },
      // Inline event-scoped session applications (event-only full-course path).
      sessionApplications: {
        where: { status: "PENDING" },
        orderBy: { sessionPosition: "asc" },
        select: {
          id: true,
          companyId: true,
          applicationData: true,
          renewalOfCourseId: true,
          sessionPosition: true,
        },
      },
      // Lightweight inline Session/Question/Answer rows (SELECTIVE_INLINE).
      sessions: { where: { courseId: null }, select: { id: true } },
    },
  });
  if (!event) throw new Error("Event not found");
  if (event.status !== "PENDING") throw new Error("Only PENDING events can be approved");
  if (!event.eventType) throw new Error("Event has no type");

  // Which accreditation model this event was submitted under, keyed by data
  // shape so both keep working: pending session applications mean the
  // full-course model (FULL_EVENT_QUIZ, plus SELECTIVE_INLINE events submitted
  // before the 2026-07-21 revert); a SELECTIVE_INLINE event without them is the
  // lightweight model and approves as a single event (no courses to accredit).
  const eventOnly = isEventOnly(event.eventType);
  const fullCourseModel = eventOnly && event.sessionApplications.length > 0;
  const lightweightInline =
    event.eventType === "SELECTIVE_INLINE" && !fullCourseModel;

  // Full-course model accredits each inline session as its own event-scoped
  // course. Parse every session's application up front (tolerant read schema).
  const sessions = fullCourseModel
    ? event.sessionApplications.map((a) => {
        const parsed = eventSessionApplicationReadSchema.safeParse(a.applicationData);
        if (!parsed.success) {
          throw new Error(`Session ${a.id} application data invalid`);
        }
        return { app: a, data: parsed.data };
      })
    : [];
  if (eventOnly && !fullCourseModel && !lightweightInline) {
    throw new Error("Event has no sessions to accredit");
  }
  if (lightweightInline && event.sessions.length === 0) {
    throw new Error("Event has no sessions");
  }

  const approvedAt = new Date();
  const expiresAt = new Date(approvedAt);
  expiresAt.setFullYear(expiresAt.getFullYear() + 3);
  const year = approvedAt.getFullYear();
  // Lightweight inline events carry their hours on Event.totalHours (set from
  // the session durations at submit), like the per-course types.
  const totalHours = fullCourseModel
    ? sessions.reduce((sum, s) => sum + s.data.ceCreditHours, 0)
    : event.totalHours
      ? Number(event.totalHours)
      : 0;

  // Deterministic, event-id-keyed asset paths (retry-safe via upsert).
  const qrStoragePath = `qrcodes/event-${event.id}.png`;
  const pdfStoragePath = `approval-letters/event-${event.id}.pdf`;

  // One transaction accredits every session (event-only path) AND finalizes the
  // event. Locks are taken in a fixed global order — course namespace first (so
  // it never deadlocks with standalone approveApplication, which takes only the
  // course lock), then the event namespace.
  const { eventIdNumber, sessionResults } = await prisma.$transaction(async (tx) => {
    if (fullCourseModel) {
      await tx.$executeRaw`select pg_advisory_xact_lock(${year})`;
    }
    await tx.$executeRaw`select pg_advisory_xact_lock(${year}, 1)`;

    const results: Array<{
      applicationId: string;
      courseIdNumber: string;
      attendeeLinkToken: string;
      qrStoragePath: string;
      pdfStoragePath: string;
      courseTitle: string;
      ceHours: number;
      deliveryFormat: string;
    }> = [];

    for (const s of sessions) {
      const r = await accreditApplicationTx(tx, {
        application: {
          id: s.app.id,
          companyId: s.app.companyId,
          renewalOfCourseId: s.app.renewalOfCourseId,
        },
        data: s.data,
        reviewerId: reviewer.id,
        approvedAt,
        expiresAt,
        year,
        eventId: event.id,
      });
      // Link the freshly-accredited course to the event as a session.
      await tx.eventSession.create({
        data: {
          eventId: event.id,
          courseId: r.courseId,
          position: s.app.sessionPosition ?? 0,
        },
      });
      results.push({
        applicationId: r.applicationId,
        courseIdNumber: r.courseIdNumber,
        attendeeLinkToken: r.attendeeLinkToken,
        qrStoragePath: r.qrStoragePath,
        pdfStoragePath: r.pdfStoragePath,
        courseTitle: s.data.courseTitle,
        ceHours: s.data.ceCreditHours,
        deliveryFormat: s.data.deliveryFormat,
      });
    }

    const id = await nextEventIdNumber(tx, year);
    const updated = await tx.event.updateMany({
      where: { id: event.id, status: "PENDING" },
      data: {
        status: "APPROVED",
        eventIdNumber: id,
        approvedAt,
        expiresAt,
        qrCodeUrl: qrStoragePath,
        approvalLetterUrl: pdfStoragePath,
        reviewedById: reviewer.id,
        reviewedAt: approvedAt,
        reviewerNotes,
        totalHours: new Prisma.Decimal(totalHours),
      },
    });
    if (updated.count !== 1) throw new Error("Event status changed during approval");
    return { eventIdNumber: id, sessionResults: results };
  });

  // Per-session approval letters (event-scoped courses attend via the event
  // token, so no per-session QR). Non-fatal, best-effort.
  for (const s of sessionResults) {
    await renderCourseAssets({
      applicationId: s.applicationId,
      courseIdNumber: s.courseIdNumber,
      attendeeLinkToken: s.attendeeLinkToken,
      qrStoragePath: s.qrStoragePath,
      pdfStoragePath: s.pdfStoragePath,
      companyName: event.company.name,
      courseTitle: s.courseTitle,
      ceHours: s.ceHours,
      deliveryMethod: s.deliveryFormat,
      approvedAt,
      expiresAt,
      withQr: false,
    });
  }

  // Assets after commit (non-fatal; the events list self-heals via eventAssetUrls).
  const attendeeUrl = `${appBaseUrl()}/attend/event/${event.attendeeLinkToken}`;
  let qrPng: Buffer | null = null;
  let letterPdf: Buffer | null = null;
  const signatory = await getLetterSignatory();
  try {
    [qrPng, letterPdf] = await Promise.all([
      renderQrPng(attendeeUrl),
      renderApprovalLetterPdf({
        companyName: event.company.name,
        courseTitle: event.name,
        courseIdNumber: eventIdNumber,
        ceHours: totalHours,
        // Events are delivered live; the per-session letters carry each
        // session's own declared format.
        deliveryMethod: "LIVE In Person",
        approvedAt,
        expiresAt,
        ...signatory,
      }),
    ]);
    await Promise.all([
      uploadToStorage({ kind: "uploads", path: qrStoragePath, body: qrPng, contentType: "image/png" }),
      uploadToStorage({ kind: "uploads", path: pdfStoragePath, body: letterPdf, contentType: "application/pdf" }),
    ]);
  } catch (err) {
    console.error(
      `[approveEvent] asset render/upload failed (eventId=${event.id}, eventIdNumber=${eventIdNumber})`,
      err,
    );
  }

  const customerEmail = event.company.users[0]?.email;
  if (customerEmail) {
    try {
      const props = {
        companyName: event.company.name,
        courseTitle: `Event: ${event.name}`,
        courseIdNumber: eventIdNumber,
        ceHours: totalHours,
        approvedAt: approvedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
        expiresAt: expiresAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
        myCoursesUrl: `${appBaseUrl()}/company/events`,
      };
      await sendEmail({
        to: customerEmail,
        subject: ApplicationApprovedEmail.subject(props),
        react: ApplicationApprovedEmail(props),
        attachments:
          qrPng && letterPdf
            ? [
                { filename: `${eventIdNumber}-approval-letter.pdf`, content: letterPdf },
                { filename: `${eventIdNumber}-attendee-qr.png`, content: qrPng },
              ]
            : undefined,
      });
    } catch (err) {
      console.error("[approveEvent] email failed", err);
    }
  }

  revalidatePath("/reviewer");
  revalidatePath("/company/events");
  redirect("/reviewer?just=approved");
}

export async function rejectEvent(formData: FormData) {
  const reviewer = await requireReviewer();
  const eventId = String(formData.get("eventId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!eventId) throw new Error("eventId required");
  if (reason.length < 10) redirect(`/reviewer/events/${eventId}?error=reason_required`);

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { company: { select: { name: true, users: { select: { email: true }, take: 1 } } } },
  });
  if (!event) throw new Error("Event not found");
  if (event.status !== "PENDING") throw new Error("Only PENDING events can be rejected");

  const rejectedAt = new Date();
  await prisma.event.update({
    where: { id: eventId },
    data: { status: "REJECTED", reviewedById: reviewer.id, reviewedAt: rejectedAt, reviewerNotes: reason },
  });

  const customerEmail = event.company.users[0]?.email;
  if (customerEmail) {
    try {
      const props = {
        companyName: event.company.name,
        courseTitle: `Event: ${event.name}`,
        submittedAt: (event.submittedAt ?? event.createdAt).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
        decisionAt: rejectedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
        reviewerFeedback: reason,
        // Deep link to where the Revise and resubmit button lives. appBaseUrl,
        // never the request Host, per the CLAUDE.md outbound-link rule.
        revisionUrl: `${appBaseUrl()}/company/events/${eventId}`,
      };
      await sendEmail({
        to: customerEmail,
        subject: ApplicationRejectedEmail.subject(props),
        react: ApplicationRejectedEmail(props),
      });
    } catch (err) {
      console.error("[rejectEvent] email failed", err);
    }
  }

  revalidatePath("/reviewer");
  revalidatePath("/company/events");
  redirect("/reviewer?just=rejected");
}
