import { redirect } from "next/navigation";
import { EventType } from "@prisma/client";
import { PageHeader } from "@/components/portal-shell";
import { FormErrorBanner, FormNav } from "@/components/application-form/form-controls";
import { CreatorFields } from "@/components/application-form/steps/creator-fields";
import { requireDentalAce } from "@/lib/auth/session";
import { ensureEventDraft, getEventDraft, saveEventCreator } from "@/lib/events/event-actions";
import { eventApplicationStepRoute, isEventOnly } from "@/lib/forms/event/schemas";

/*
  Event wizard (SELECTIVE_INLINE), Step 4 — Course Creator. Event-level, entered
  once for the whole event; reuses the shared <CreatorFields>.
*/
export default async function EventCreatorPage({
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
  if (!app.courseTitle) redirect(eventApplicationStepRoute("course"));

  return (
    <>
      <PageHeader title="New Event" subtitle="Step 4 of 7 — Course Creator" />
      {error === "validation" ? <FormErrorBanner detail={detail} /> : null}
      <form action={saveEventCreator} className="space-y-5">
        <input type="hidden" name="eventId" value={eventId} />
        <CreatorFields draft={app} />
        <FormNav
          back={{ href: eventApplicationStepRoute("course"), label: "Back" }}
          nextLabel="Next: Presenters"
        />
      </form>
    </>
  );
}
