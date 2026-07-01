import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import type { ApplicationData } from "@/lib/forms/application/schemas";

/*
  Loader for a single inline event-session application (event-only full-course
  path). Server-only (not a "use server" action) so the sub-wizard pages can read
  the draft directly. Scoped to the caller's company + a DRAFT, event-scoped row.
*/
export type SessionAppDraft = {
  id: string;
  eventId: string;
  data: Partial<ApplicationData>;
};

export async function getSessionApp(
  sessionAppId: string,
): Promise<SessionAppDraft | null> {
  const user = await getCurrentUser();
  if (!user || !user.companyId) redirect("/login");

  const row = await prisma.courseApplication.findFirst({
    where: {
      id: sessionAppId,
      companyId: user.companyId,
      status: "DRAFT",
      eventId: { not: null },
    },
    select: { id: true, eventId: true, applicationData: true },
  });
  if (!row || !row.eventId) return null;
  return {
    id: row.id,
    eventId: row.eventId,
    data: (row.applicationData as Partial<ApplicationData> | null) ?? {},
  };
}
