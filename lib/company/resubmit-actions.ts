"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { stripLegacyStubKeys } from "@/lib/forms/application/legacy";
import { canRevise, revisePatch } from "@/lib/company/resubmit-rules";

/*
  Provider-side "revise and resubmit" for a rejected submission.

  Before this, a rejection was terminal: every wizard read and write is scoped
  to status DRAFT, ensureEventDraft/ensureDraft only ever look for a DRAFT, and
  submit requires DRAFT, so a rejected item could not be edited or resubmitted
  by any path. The rejection email nonetheless told providers they could
  resubmit. Rebuilding an 8-session event from scratch was the only option.

  Neither path charges a credit: creditChargedAt is already set on anything
  that has been through submit, and submit skips the decrement when it is
  (client decision 2026-07-29).

  Events revise IN PLACE (REJECTED -> DRAFT on the same row) because every
  wizard write is already DRAFT-scoped, so flipping the status turns the whole
  wizard back on with no new code, and the sessions stay where they are.
  Cloning would copy every event_sessions row and, for FULL_EVENT_QUIZ, would
  have to clone CourseApplication rows too. Per CLAUDE.md the accreditation
  model is detected by whether those rows exist, so a clone that got it wrong
  would silently misclassify the event at approval.

  Applications CLONE, following startCourseRenewal (lib/company/course-renewal.ts),
  because a CourseApplication is one row with no children and ensureDraft picks
  the newest draft, so no routing change is needed.
*/

async function customerCompanyId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user?.companyId) redirect("/login");
  return user.companyId;
}

export async function reviseEvent(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) redirect("/company/events?error=revise_failed");
  const companyId = await customerCompanyId();

  const event = await prisma.event.findFirst({
    where: { id: eventId, companyId },
    select: { id: true, status: true, eventType: true },
  });
  if (!event) redirect("/company/events?error=revise_not_found");
  if (!canRevise(event.status)) {
    redirect("/company/events?error=revise_not_allowed");
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.event.updateMany({
      where: { id: eventId, companyId, status: "REJECTED" },
      // reviewerNotes, submittedAt and creditChargedAt are deliberately
      // untouched; see revisePatch.
      data: revisePatch(),
    });
    if (updated.count !== 1) throw new Error("Event status changed during revise");

    // FULL_EVENT_QUIZ sessions are CourseApplication rows that rejectEvent
    // never touched, so they are still PENDING. submitEvent's full-course
    // branch only flips rows that are DRAFT, so without this the resubmit
    // throws "A session was already submitted".
    await tx.courseApplication.updateMany({
      where: { eventId, companyId, status: "PENDING" },
      data: { status: "DRAFT", submittedAt: null },
    });
  });

  revalidatePath("/company/events");
  // Explicit id: a revised event has submittedAt set, so ensureEventDraft will
  // not resume it implicitly (that scope is what stops a settled row being
  // reused as a free new submission).
  redirect(`/company/events/new/review?eventId=${eventId}`);
}

export async function resubmitApplication(formData: FormData): Promise<void> {
  const applicationId = String(formData.get("applicationId") ?? "");
  if (!applicationId) redirect("/company/courses?error=revise_failed");
  const companyId = await customerCompanyId();

  const app = await prisma.courseApplication.findFirst({
    where: { id: applicationId, companyId },
    select: {
      id: true,
      status: true,
      applicationData: true,
      creditChargedAt: true,
      renewalOfCourseId: true,
    },
  });
  if (!app) redirect("/company/courses?error=revise_not_found");
  if (!canRevise(app.status)) {
    redirect("/company/courses?error=revise_not_allowed");
  }

  // Don't start a second revision of the same rejection, mirroring the
  // in-flight guard in startCourseRenewal.
  const open = await prisma.courseApplication.findFirst({
    where: { companyId, resubmitOfId: app.id, status: { in: ["DRAFT", "PENDING"] } },
    select: { id: true },
  });
  if (open) redirect("/company/courses?error=revise_in_progress");

  await prisma.courseApplication.create({
    data: {
      companyId,
      status: "DRAFT",
      applicationData: stripLegacyStubKeys(app.applicationData) as Prisma.InputJsonValue,
      resubmitOfId: app.id,
      // Carrying the parent's stamp is what makes the revision free. A RENEWAL
      // clone deliberately does not do this: a renewal is a new accreditation.
      creditChargedAt: app.creditChargedAt,
      renewalOfCourseId: app.renewalOfCourseId,
    },
  });

  revalidatePath("/company/courses");
  // ensureDraft picks the newest DRAFT, which is now this clone.
  redirect("/company/applications/new/review");
}
