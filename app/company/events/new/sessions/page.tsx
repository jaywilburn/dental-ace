import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { FormErrorBanner } from "@/components/application-form/form-controls";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { ensureEventDraft, getEventDraft } from "@/lib/events/event-actions";
import {
  InlineSessionsForm,
  type SessionDraft,
} from "@/components/events/inline-sessions-form";

type StoredQuestion = { question?: string; options?: string[]; correctIndex?: number };

/*
  Event wizard (Opt 3, SELECTIVE_INLINE) — list each session inline (name,
  duration, one MC question). On approval the attendee form is generated from
  these. Reachable only for SELECTIVE_INLINE.
*/
export default async function EventSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  await requireDentalAce();
  const { error, detail } = await searchParams;
  const eventId = await ensureEventDraft();
  const draft = await getEventDraft(eventId);
  if (!draft?.eventType) redirect("/company/events/new/qualifiers");
  if (draft.eventType === "FULL_EVENT_QUIZ") redirect("/company/events/new/quiz");
  if (draft.eventType !== "SELECTIVE_INLINE") redirect("/company/events/new/courses");

  // Inline sessions hold their MC question in EventSession.question (JSON).
  const rows = await prisma.eventSession.findMany({
    where: { eventId, courseId: null },
    orderBy: { position: "asc" },
    select: { name: true, durationHours: true, question: true },
  });
  const initial: SessionDraft[] = rows.map((r) => {
    const q = (r.question as StoredQuestion | null) ?? {};
    return {
      name: r.name ?? "",
      durationHours: r.durationHours ? String(Number(r.durationHours)) : "1",
      question: q.question ?? "",
      options: q.options && q.options.length === 4 ? q.options : ["", "", "", ""],
      correctIndex: q.correctIndex ?? 0,
    };
  });

  return (
    <>
      <PageHeader title="New Event" subtitle="Step 3 of 4 — Sessions" />
      {error === "validation" ? <FormErrorBanner detail={detail} /> : null}
      <div className="mb-4 rounded-md border border-ver bg-ver-bg p-3 text-[12px] text-ver-dark text-pretty">
        List each session attendees can choose from. Each needs a name, its
        duration (0.5-hour increments), and one multiple-choice question.
        Attendees pick which sessions they attended and answer one question per
        session; their certificate shows the total hours of the sessions they
        completed.
      </div>
      <InlineSessionsForm eventId={eventId} initial={initial} />
    </>
  );
}
