"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { recordAdminAction } from "@/lib/admin/audit";
import { sendEmail } from "@/lib/email/send";
import { appBaseUrl } from "@/lib/app-url";
import ReviewReopenedEmail from "@/emails/review-reopened";
import {
  canReopen,
  isValidReopenReason,
  reopenPatch,
} from "@/lib/reviewer/reopen-rules";

/*
  Reversing a rejection, for REVIEWER and ADMIN.

  On 2026-07-29 a reviewer rejected a complete 8-session event because the
  review page hid the application behind collapsed disclosures. Nothing in the
  product could undo that: approve and reject both hard-throw unless the item is
  PENDING, there is no admin override, and the provider had no resubmit button
  either. The only remedy was a manual database write.

  Reopen puts a REJECTED item straight back in the queue. It is distinct from
  the company-side revise, which moves an event back to DRAFT so the provider
  can change it. Reopen means "the decision was wrong", revise means "the
  submission needs work". Rejecting a good application is the former.

  Deliberately REJECTED-only; see canReopen in ./reopen-rules.ts for why an
  approved item must not travel this path.
*/

async function requireReviewer() {
  const user = await getCurrentUser();
  if (!user || (user.staffRole !== "REVIEWER" && user.staffRole !== "ADMIN")) {
    redirect("/login");
  }
  return user;
}

/** Notify the provider that a decision was reversed. The reason is a staff
 *  note and is deliberately NOT included. Non-fatal, mirroring rejectEvent. */
async function notifyReopened(args: {
  to: string | undefined;
  companyName: string;
  itemTitle: string;
  detailUrl: string;
}): Promise<void> {
  if (!args.to) return;
  const props = {
    companyName: args.companyName,
    itemTitle: args.itemTitle,
    detailUrl: args.detailUrl,
  };
  try {
    await sendEmail({
      to: args.to,
      subject: ReviewReopenedEmail.subject(props),
      react: ReviewReopenedEmail(props),
    });
  } catch (err) {
    console.error("[reopen] provider notification failed", err);
  }
}

export async function reopenEvent(formData: FormData) {
  const reviewer = await requireReviewer();
  const eventId = String(formData.get("eventId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!eventId) throw new Error("eventId required");
  if (!isValidReopenReason(reason)) {
    redirect(`/reviewer/events/${eventId}?error=reason_required`);
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      company: { select: { name: true, users: { select: { email: true }, take: 1 } } },
    },
  });
  if (!event) throw new Error("Event not found");
  if (!canReopen(event.status)) {
    throw new Error(`Only REJECTED events can be reopened (this one is ${event.status})`);
  }

  // Status flip and audit row commit together: an un-audited status reversal
  // is exactly the thing this log exists to prevent.
  await prisma.$transaction(async (tx) => {
    const updated = await tx.event.updateMany({
      where: { id: eventId, status: "REJECTED" },
      data: reopenPatch(),
    });
    if (updated.count !== 1) throw new Error("Event decision changed during reopen");

    await recordAdminAction(tx, {
      actorUserId: reviewer.id,
      // The subject is an event, not a user; its identity lives in details.
      targetUserId: null,
      action: "REVIEW_REOPENED",
      summary: `Reopened rejected event "${event.name}" (${event.company.name}) for re-review`,
      details: {
        entity: "EVENT",
        id: eventId,
        previousStatus: event.status,
        previousReviewedAt: event.reviewedAt?.toISOString() ?? null,
        previousReviewedById: event.reviewedById,
        previousReviewerNotes: event.reviewerNotes,
        reason: reason.trim(),
      },
    });
  });

  await notifyReopened({
    to: event.company.users[0]?.email,
    companyName: event.company.name,
    itemTitle: `Event: ${event.name}`,
    detailUrl: `${appBaseUrl()}/company/events/${eventId}`,
  });

  revalidatePath("/reviewer");
  revalidatePath("/reviewer/rejected");
  revalidatePath("/company/events");
  redirect(`/reviewer/events/${eventId}?ok=reopened`);
}

export async function reopenApplication(formData: FormData) {
  const reviewer = await requireReviewer();
  const applicationId = String(formData.get("applicationId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!applicationId) throw new Error("applicationId required");
  if (!isValidReopenReason(reason)) {
    redirect(`/reviewer/${applicationId}?error=reason_required`);
  }

  const app = await prisma.courseApplication.findUnique({
    where: { id: applicationId },
    include: {
      company: { select: { name: true, users: { select: { email: true }, take: 1 } } },
    },
  });
  if (!app) throw new Error("Application not found");
  if (!canReopen(app.status)) {
    throw new Error(`Only REJECTED applications can be reopened (this one is ${app.status})`);
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.courseApplication.updateMany({
      where: { id: applicationId, status: "REJECTED" },
      data: reopenPatch(),
    });
    if (updated.count !== 1) throw new Error("Application decision changed during reopen");

    await recordAdminAction(tx, {
      actorUserId: reviewer.id,
      targetUserId: null,
      action: "REVIEW_REOPENED",
      summary: `Reopened rejected application "${app.courseTitle ?? "Untitled"}" (${app.company.name}) for re-review`,
      details: {
        entity: "APPLICATION",
        id: applicationId,
        previousStatus: app.status,
        previousReviewedAt: app.reviewedAt?.toISOString() ?? null,
        previousReviewedById: app.reviewedById,
        previousReviewerNotes: app.reviewerNotes,
        reason: reason.trim(),
      },
    });
  });

  await notifyReopened({
    to: app.company.users[0]?.email,
    companyName: app.company.name,
    itemTitle: app.courseTitle ?? "Course application",
    detailUrl: `${appBaseUrl()}/company/applications/${applicationId}`,
  });

  revalidatePath("/reviewer");
  revalidatePath("/reviewer/rejected");
  revalidatePath("/company/courses");
  redirect(`/reviewer/${applicationId}?ok=reopened`);
}
