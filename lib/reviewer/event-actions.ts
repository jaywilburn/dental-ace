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
    },
  });
  if (!event) throw new Error("Event not found");
  if (event.status !== "PENDING") throw new Error("Only PENDING events can be approved");

  const approvedAt = new Date();
  const expiresAt = new Date(approvedAt);
  expiresAt.setFullYear(expiresAt.getFullYear() + 3);
  const year = approvedAt.getFullYear();
  const totalHours = event.totalHours ? Number(event.totalHours) : 0;

  // Deterministic, event-id-keyed asset paths (retry-safe via upsert).
  const qrStoragePath = `qrcodes/event-${event.id}.png`;
  const pdfStoragePath = `approval-letters/event-${event.id}.pdf`;

  const eventIdNumber = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(${year}, 1)`;
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
      },
    });
    if (updated.count !== 1) throw new Error("Event status changed during approval");
    return id;
  });

  // Assets after commit (non-fatal; the events list self-heals via eventAssetUrls).
  const attendeeUrl = `${appBaseUrl()}/attend/event/${event.attendeeLinkToken}`;
  let qrPng: Buffer | null = null;
  let letterPdf: Buffer | null = null;
  try {
    [qrPng, letterPdf] = await Promise.all([
      renderQrPng(attendeeUrl),
      renderApprovalLetterPdf({
        companyName: event.company.name,
        courseTitle: event.name,
        courseIdNumber: eventIdNumber,
        ceHours: totalHours,
        approvedAt,
        expiresAt,
        reviewerName: reviewer.email.split("@")[0],
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
