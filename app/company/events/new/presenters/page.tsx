import { redirect } from "next/navigation";
import { EventType } from "@prisma/client";
import { PageHeader } from "@/components/portal-shell";
import { FormErrorBanner, FormNav } from "@/components/application-form/form-controls";
import { PresentersFields } from "@/components/application-form/steps/presenters-fields";
import { requireDentalAce } from "@/lib/auth/session";
import { ensureEventDraft, getEventDraft, saveEventPresenters } from "@/lib/events/event-actions";
import { eventApplicationStepRoute, isEventOnly } from "@/lib/forms/event/schemas";

/*
  Event wizard (SELECTIVE_INLINE), Step 5 — Presenters. Event-level, entered
  once for the whole event; reuses the shared <PresentersFields>. Saving moves
  on to the Session/Question/Answer grid.
*/
export default async function EventPresentersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  await requireDentalAce();
  const { error, detail } = await searchParams;
  const eventId = await ensureEventDraft();
  const draft = await getEventDraft(eventId);
  if (!draft?.eventType) redirect("/company/events/new/qualifiers");
  if (draft.eventType !== EventType.SELECTIVE_INLINE) {
    redirect(
      isEventOnly(draft.eventType)
        ? "/company/events/new/sessions"
        : "/company/events/new/courses",
    );
  }
  const app = draft.data.eventApplication ?? {};
  if (!app.creatorName) redirect(eventApplicationStepRoute("creator"));

  return (
    <>
      <PageHeader title="New Event" subtitle="Step 5 of 7 — Presenters" />
      {error === "validation" ? <FormErrorBanner detail={detail} /> : null}
      <form action={saveEventPresenters} className="space-y-5">
        <input type="hidden" name="eventId" value={eventId} />
        <PresentersFields draft={app} />
        <FormNav
          back={{ href: eventApplicationStepRoute("creator"), label: "Back" }}
          nextLabel="Next: Sessions"
        />
      </form>
    </>
  );
}
