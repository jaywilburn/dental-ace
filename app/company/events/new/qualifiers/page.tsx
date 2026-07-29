import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { FormErrorBanner, FormNav } from "@/components/application-form/form-controls";
import { requireDentalAce } from "@/lib/auth/session";
import { ensureEventDraft, getEventDraft, saveQualifiers } from "@/lib/events/event-actions";

/*
  Event wizard, Step 2 — the two qualifier questions. Their combination picks one
  of four event types and routes the next step (quiz / inline sessions / attach
  courses). See lib/forms/event/schemas.ts deriveEventType.
*/
export default async function EventQualifiersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string; eventId?: string }>;
}) {
  await requireDentalAce();
  const { error, detail, eventId: eventIdParam } = await searchParams;
  const idQ = eventIdParam ? `?eventId=${eventIdParam}` : "";
  const eventId = await ensureEventDraft(eventIdParam);
  const draft = await getEventDraft(eventId);
  if (!draft?.name) redirect("/company/events/new");
  const coverage = draft?.data.coverage;
  const reuse = draft?.data.reuse;

  return (
    <>
      <PageHeader title="New Event" subtitle="Step 2 of 4 — Event Type" />
      {error === "validation" ? <FormErrorBanner detail={detail} /> : null}
      <form action={saveQualifiers} className="space-y-5">
        <input type="hidden" name="eventId" value={eventId} />

        <fieldset className="rounded-lg border border-border bg-white p-5">
          <legend className="px-1 text-[13px] font-semibold text-navy">
            Attendance
          </legend>
          <p className="mb-3 text-[12px] text-text-mid text-pretty">
            Will every attendee attend all sessions (and receive the full CE for
            the event), or will attendees choose which sessions they attend (and
            receive hours only for those)?
          </p>
          <div className="space-y-2 text-[13px] text-text-mid">
            <label className="flex items-start gap-2.5 rounded-md border border-border p-3">
              <input type="radio" name="coverage" value="FULL" defaultChecked={coverage !== "SELECTIVE"} className="mt-0.5" />
              <span><strong className="text-navy">Everyone attends every session.</strong> One certificate covering the full event hours.</span>
            </label>
            <label className="flex items-start gap-2.5 rounded-md border border-border p-3">
              <input type="radio" name="coverage" value="SELECTIVE" defaultChecked={coverage === "SELECTIVE"} className="mt-0.5" />
              <span><strong className="text-navy">Attendees select individual sessions.</strong> The certificate reflects only the sessions they attended.</span>
            </label>
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-border bg-white p-5">
          <legend className="px-1 text-[13px] font-semibold text-navy">
            Post-event reuse
          </legend>
          <p className="mb-3 text-[12px] text-text-mid text-pretty">
            Will you offer any of these sessions as separate courses after the
            event, or is this the only time they will be offered?
          </p>
          <div className="space-y-2 text-[13px] text-text-mid">
            <label className="flex items-start gap-2.5 rounded-md border border-border p-3">
              <input type="radio" name="reuse" value="EVENT_ONLY" defaultChecked={reuse !== "PER_COURSE"} className="mt-0.5" />
              <span><strong className="text-navy">Only this time.</strong> The event is accredited as a single application (you list the sessions inside it) and uses one application credit.</span>
            </label>
            <label className="flex items-start gap-2.5 rounded-md border border-border p-3">
              <input type="radio" name="reuse" value="PER_COURSE" defaultChecked={reuse === "PER_COURSE"} className="mt-0.5" />
              <span><strong className="text-navy">Reoffered individually later.</strong> Each session is accredited as its own course and attached to the event, so the event itself uses no credits.</span>
            </label>
          </div>
        </fieldset>

        <FormNav back={{ href: `/company/events/new${idQ}`, label: "Back" }} nextLabel="Next" />
      </form>
    </>
  );
}
