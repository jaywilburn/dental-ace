import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  step2Schema,
  step3Schema,
  type ApplicationData,
} from "@/lib/forms/application/schemas";

/*
  Loader for one SELECTIVE_INLINE session's mini-wizard (Course Info -> Creator
  -> Presenters -> Question). Server-only (not a "use server" action) so the
  sub-wizard pages can read the draft directly. Scoped to the caller's company +
  a DRAFT, inline (courseId null) EventSession. The whole front-half application
  lives in event_sessions.course_info; the one MC question in
  event_sessions.question.
*/
export type InlineSessionDraft = {
  id: string;
  eventId: string;
  data: Partial<ApplicationData>;
  question: unknown;
};

export async function getInlineSession(
  sessionId: string,
): Promise<InlineSessionDraft | null> {
  const user = await getCurrentUser();
  if (!user || !user.companyId) redirect("/login");

  const row = await prisma.eventSession.findFirst({
    where: {
      id: sessionId,
      courseId: null,
      event: { companyId: user.companyId, status: "DRAFT" },
    },
    select: {
      id: true,
      eventId: true,
      courseInfo: true,
      question: true,
      event: { select: { eventData: true } },
    },
  });
  if (!row) return null;

  const courseInfo = (row.courseInfo as Partial<ApplicationData> | null) ?? {};

  // Draft-migration prefill: older SELECTIVE_INLINE drafts captured Creator +
  // Presenters once at the event level (eventData.eventApplication). Seed those
  // slices so a mid-flight draft does not re-type them; the session's own saved
  // values always win. New events have no eventApplication, so this is a no-op.
  const ed = (row.event.eventData as Record<string, unknown> | null) ?? {};
  const legacy = ed.eventApplication;
  let data: Partial<ApplicationData> = courseInfo;
  if (legacy && typeof legacy === "object") {
    const creator = step2Schema.partial().safeParse(legacy);
    const presenters = step3Schema.partial().safeParse(legacy);
    data = {
      ...(creator.success ? creator.data : {}),
      ...(presenters.success ? presenters.data : {}),
      ...courseInfo,
    };
  }

  return { id: row.id, eventId: row.eventId, data, question: row.question };
}
