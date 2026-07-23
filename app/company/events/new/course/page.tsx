import { redirect } from "next/navigation";
import { EventType } from "@prisma/client";
import { PageHeader } from "@/components/portal-shell";
import { FormErrorBanner, FormNav } from "@/components/application-form/form-controls";
import { CourseFields } from "@/components/application-form/steps/course-fields";
import { requireDentalAce } from "@/lib/auth/session";
import { ensureEventDraft, getEventDraft, saveEventCourseInfo } from "@/lib/events/event-actions";
import { EVENT_OUTLINE_MAX, isEventOnly } from "@/lib/forms/event/schemas";

/*
  Event wizard (SELECTIVE_INLINE), Step 3 — Course Information. The event-level
  application front half, entered once for the whole event. Reuses the shared
  <CourseFields> from the standalone application wizard; posts to
  saveEventCourseInfo (persists to eventData.eventApplication).
*/
export default async function EventCourseInfoPage({
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

  return (
    <>
      <PageHeader title="New Event" subtitle="Step 3 of 7 — Course Information" />
      {error === "validation" ? <FormErrorBanner detail={detail} /> : null}
      <div className="mb-4 rounded-md border border-ver bg-ver-bg p-3 text-[12px] text-ver-dark text-pretty">
        This event is accredited as a single application, so the course
        information below is entered once and covers every session. Enter the
        full event&apos;s total CE Credit Hours here; certificates use the sum
        of the per-session hours you list after the presenter details. The
        Event Outline covers the whole event and has no practical length limit;
        each session also gets its own course information at the Sessions step.
      </div>
      <form action={saveEventCourseInfo} className="space-y-5">
        <input type="hidden" name="eventId" value={eventId} />
        <CourseFields
          draft={app}
          outlineLabel="Event Outline"
          outlineMaxLength={EVENT_OUTLINE_MAX}
        />
        <FormNav
          back={{ href: "/company/events/new/qualifiers", label: "Back" }}
          nextLabel="Next: Creator"
        />
      </form>
    </>
  );
}
