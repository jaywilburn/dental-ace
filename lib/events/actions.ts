"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/*
  Server actions for the Event Setup flow.

  - createEvent: company creates a new event record (name + free-form dates)
  - saveEventSessions: tags approved courses to the event via event_sessions
*/

async function customerCompanyId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user || user.role !== "CUSTOMER" || !user.companyId) redirect("/login");
  return user.companyId;
}

export async function createEvent(formData: FormData) {
  const companyId = await customerCompanyId();
  const name = String(formData.get("name") ?? "").trim();
  const eventDate = String(formData.get("eventDate") ?? "").trim();
  if (name.length < 3) throw new Error("Event name is required");
  if (eventDate.length < 3) throw new Error("Event date is required");

  const event = await prisma.event.create({
    data: { companyId, name, eventDate },
  });
  revalidatePath("/company/events");
  redirect(`/company/events/${event.id}/setup`);
}

export async function saveEventSessions(formData: FormData) {
  const companyId = await customerCompanyId();
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) throw new Error("eventId required");

  // Ownership check on the event. Prisma connects as the postgres role and
  // bypasses RLS, so every cross-tenant guard has to live in app code.
  const event = await prisma.event.findFirst({
    where: { id: eventId, companyId },
    select: { id: true },
  });
  if (!event) redirect("/company/events");

  const courseIds = formData.getAll("courseIds").map((v) => String(v));

  // Verify every submitted courseId belongs to the caller's company before
  // writing the join rows. The FK alone only checks existence, not ownership.
  if (courseIds.length > 0) {
    const owned = await prisma.accreditedCourse.count({
      where: { id: { in: courseIds }, companyId },
    });
    if (owned !== courseIds.length) {
      throw new Error("One or more courses do not belong to your company");
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.eventSession.deleteMany({ where: { eventId } });
    if (courseIds.length > 0) {
      await tx.eventSession.createMany({
        data: courseIds.map((courseId, position) => ({ eventId, courseId, position })),
      });
    }
  });
  revalidatePath(`/company/events/${eventId}/setup`);
  revalidatePath("/company/events");
  redirect(`/company/events?just=saved`);
}
