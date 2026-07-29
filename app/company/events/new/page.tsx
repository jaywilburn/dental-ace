import { PageHeader } from "@/components/portal-shell";
import {
  FormCard,
  FormField,
  FormInput,
  FormLabel,
  FormNav,
} from "@/components/application-form/form-controls";
import { CountedTextarea } from "@/components/application-form/counted-fields";
import {
  StepErrors,
  FieldError,
} from "@/components/application-form/field-errors";
import { deriveStepErrors } from "@/lib/forms/field-errors";
import { orgStepSchema } from "@/lib/forms/application/schemas";
import { eventDetailsSchema } from "@/lib/forms/event/schemas";
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
  searchParams: Promise<{ error?: string; eventId?: string }>;
}) {
  const user = await requireDentalAce();
  const { error, eventId: eventIdParam } = await searchParams;
  const eventId = await ensureEventDraft(eventIdParam);
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

  // name/eventDate live in BOTH eventData and their own Event columns. The
  // columns are only written on a successful save (a blank name must not
  // overwrite what /company/events lists by), so on the echo path eventData
  // holds the newer value and has to win, or these two fields alone would still
  // lose the provider's edit.
  const nameDefault = d.name ?? draft?.name ?? "";
  const eventDateDefault = d.eventDate ?? draft?.eventDate ?? "";

  const errors =
    error === "validation"
      ? deriveStepErrors(orgStepSchema.merge(eventDetailsSchema), {
          ...d,
          name: nameDefault,
          eventDate: eventDateDefault,
        })
      : {};
  return (
    <>
      <PageHeader title="New Event" subtitle="Step 1 of 4 — Organization & Event" />
      <StepErrors error={error} errors={errors} />
      <form action={saveEventDetails} className="space-y-5">
        <input type="hidden" name="eventId" value={eventId} />
        <FormCard title="Event">
          <FormField fullWidth>
            <FormLabel required>Event Name</FormLabel>
            <FormInput
              id="name"
              name="name"
              defaultValue={nameDefault}
              required
              minLength={3}
              maxLength={200}
              aria-invalid={errors.name ? true : undefined}
            />
            <FieldError messages={errors.name} />
          </FormField>
          <FormField fullWidth>
            <FormLabel required hint="Free-form, e.g. June 14-15, 2026">
              Event Date(s)
            </FormLabel>
            <FormInput
              id="eventDate"
              name="eventDate"
              defaultValue={eventDateDefault}
              required
              minLength={3}
              maxLength={120}
              aria-invalid={errors.eventDate ? true : undefined}
            />
            <FieldError messages={errors.eventDate} />
          </FormField>
        </FormCard>

        <FormCard title="Organization & Contact">
          <FormField fullWidth>
            <FormLabel required>Name of Organization / Company / Association</FormLabel>
            <FormInput
              id="organizationName"
              name="organizationName"
              defaultValue={orgNameDefault}
              required
              minLength={2}
              maxLength={200}
              aria-invalid={errors.organizationName ? true : undefined}
            />
            <FieldError messages={errors.organizationName} />
          </FormField>
          <FormField fullWidth>
            <FormLabel required hint="City, State, Zip">Organization Full Address</FormLabel>
            <CountedTextarea
              id="organizationAddress"
              name="organizationAddress"
              defaultValue={d.organizationAddress ?? ""}
              required
              minLength={5}
              max={400}
              invalid={Boolean(errors.organizationAddress)}
            />
            <FieldError messages={errors.organizationAddress} />
          </FormField>
          <FormField fullWidth>
            <FormLabel required hint="Responsible for all interactions, communications, and billing">
              Process Administrator Full Name
            </FormLabel>
            <FormInput
              id="adminName"
              name="adminName"
              defaultValue={adminNameDefault}
              required
              minLength={2}
              maxLength={200}
              aria-invalid={errors.adminName ? true : undefined}
            />
            <FieldError messages={errors.adminName} />
          </FormField>
          <FormField>
            <FormLabel required>Process Administrator Email</FormLabel>
            <FormInput
              type="email"
              id="adminEmail"
              name="adminEmail"
              defaultValue={adminEmailDefault}
              required
              maxLength={200}
              aria-invalid={errors.adminEmail ? true : undefined}
            />
            <FieldError messages={errors.adminEmail} />
          </FormField>
          <FormField>
            <FormLabel required>Process Administrator Phone</FormLabel>
            <FormInput
              type="tel"
              id="adminPhone"
              name="adminPhone"
              defaultValue={d.adminPhone ?? ""}
              required
              minLength={7}
              maxLength={40}
              aria-invalid={errors.adminPhone ? true : undefined}
            />
            <FieldError messages={errors.adminPhone} />
          </FormField>
        </FormCard>

        <FormNav back={{ href: "/company/events", label: "Cancel" }} nextLabel="Next: Event Type" />
      </form>
    </>
  );
}
