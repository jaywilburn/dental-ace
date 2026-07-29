import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { FormNav } from "@/components/application-form/form-controls";
import { StepErrors } from "@/components/application-form/field-errors";
import { deriveStepErrors } from "@/lib/forms/field-errors";
import { step2WriteSchema } from "@/lib/forms/application/write-schemas";
import { CreatorFields } from "@/components/application-form/steps/creator-fields";
import { requireDentalAce } from "@/lib/auth/session";
import { getInlineSession } from "@/lib/events/inline-session-data";
import { saveInlineSessionCreator } from "@/lib/events/inline-session-actions";

/* SELECTIVE_INLINE per-session mini-wizard, Step 2 — Course Creator. */
export default async function InlineSessionCreatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireDentalAce();
  const { sessionId } = await params;
  const { error } = await searchParams;
  const session = await getInlineSession(sessionId);
  if (!session) redirect("/company/events/new/sessions");
  if (!session.data.courseTitle) {
    redirect(`/company/events/new/inline-sessions/${sessionId}/course`);
  }

  // Errors are re-derived from the draft the failing action just echoed back,
  // so they always line up with what is rendered below. Nothing is stored or
  // passed through the URL, and a stale ?error= over a fixed draft yields none.
  const errors = error === "validation" ? deriveStepErrors(step2WriteSchema, session.data) : {};
  return (
    <>
      <PageHeader title="Event Session" subtitle="Step 2 of 4 — Course Creator" />
      <StepErrors error={error} errors={errors} />
      <form action={saveInlineSessionCreator} className="space-y-5">
        <input type="hidden" name="sessionId" value={session.id} />
        <CreatorFields draft={session.data} errors={errors} />
        <FormNav
          back={{
            href: `/company/events/new/inline-sessions/${sessionId}/course`,
            label: "Back",
          }}
          nextLabel="Next: Presenters"
        />
      </form>
    </>
  );
}
