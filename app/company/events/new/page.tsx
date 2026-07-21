import { EventType } from "@prisma/client";
import { PageHeader } from "@/components/portal-shell";
import {
  FormCard,
  FormErrorBanner,
  FormField,
  FormInput,
  FormLabel,
  FormNav,
  FormTextarea,
} from "@/components/application-form/form-controls";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { ensureEventDraft, getEventDraft, saveEventDetails } from "@/lib/events/event-actions";

/*
  Event wizard, Step 1 — Organization & Event details. The event runs through its
  own accreditation lifecycle (DRAFT -> PENDING -> APPROVED); this materializes
  the draft and captures the host org plus the event name and dates.
*/
export default async function EventDetailsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  const user = await requireDentalAce();
  const { error, detail } = await searchParams;
  const eventId = await ensureEventDraft();
  const draft = await getEventDraft(eventId);

  const company = user.companyId
    ? await prisma.company.findUnique({
        where: { id: user.companyId },
        select: { name: true },
      })
    : null;

  const d = draft?.data ?? {};
  const orgNameDefault = d.organizationName ?? company?.name ?? "";
  const adminNameDefault =
    d.adminName ?? [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  const adminEmailDefault = d.adminEmail ?? user.email ?? "";

  // SELECTIVE_INLINE drafts run the longer 7-step flow (event-level Course
  // Info -> Creator -> Presenters before the session grid); before a type is
  // chosen the wizard shows the 4-step baseline.
  const stepCount = draft?.eventType === EventType.SELECTIVE_INLINE ? 7 : 4;

  return (
    <>
      <PageHeader title="New Event" subtitle={`Step 1 of ${stepCount} — Organization & Event`} />
      {error === "validation" ? <FormErrorBanner detail={detail} /> : null}
      <form action={saveEventDetails} className="space-y-5">
        <input type="hidden" name="eventId" value={eventId} />
        <FormCard title="Event">
          <FormField fullWidth>
            <FormLabel required>Event Name</FormLabel>
            <FormInput name="name" defaultValue={draft?.name ?? ""} required minLength={3} maxLength={200} />
          </FormField>
          <FormField fullWidth>
            <FormLabel required hint="Free-form, e.g. June 14-15, 2026">
              Event Date(s)
            </FormLabel>
            <FormInput name="eventDate" defaultValue={draft?.eventDate ?? ""} required minLength={3} maxLength={120} />
          </FormField>
        </FormCard>

        <FormCard title="Organization & Contact">
          <FormField fullWidth>
            <FormLabel required>Name of Organization / Company / Association</FormLabel>
            <FormInput name="organizationName" defaultValue={orgNameDefault} required minLength={2} maxLength={200} />
          </FormField>
          <FormField fullWidth>
            <FormLabel required hint="City, State, Zip">Organization Full Address</FormLabel>
            <FormTextarea name="organizationAddress" defaultValue={d.organizationAddress ?? ""} required minLength={5} maxLength={400} />
          </FormField>
          <FormField fullWidth>
            <FormLabel required hint="Responsible for all interactions, communications, and billing">
              Process Administrator Full Name
            </FormLabel>
            <FormInput name="adminName" defaultValue={adminNameDefault} required minLength={2} maxLength={200} />
          </FormField>
          <FormField>
            <FormLabel required>Process Administrator Email</FormLabel>
            <FormInput type="email" name="adminEmail" defaultValue={adminEmailDefault} required />
          </FormField>
          <FormField>
            <FormLabel required>Process Administrator Phone</FormLabel>
            <FormInput type="tel" name="adminPhone" defaultValue={d.adminPhone ?? ""} required minLength={7} maxLength={40} />
          </FormField>
        </FormCard>

        <FormNav back={{ href: "/company/events", label: "Cancel" }} nextLabel="Next: Event Type" />
      </form>
    </>
  );
}
