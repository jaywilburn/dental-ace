import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { FormNav } from "@/components/application-form/form-controls";
import { StepErrors } from "@/components/application-form/field-errors";
import { deriveStepErrors } from "@/lib/forms/field-errors";
import { step2WriteSchema } from "@/lib/forms/application/write-schemas";
import { CreatorFields } from "@/components/application-form/steps/creator-fields";
import { requireDentalAce } from "@/lib/auth/session";
import { getSessionApp } from "@/lib/events/session-data";
import { saveSessionCreator } from "@/lib/events/session-actions";

export default async function SessionCreatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionAppId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireDentalAce();
  const { sessionAppId } = await params;
  const { error } = await searchParams;
  const app = await getSessionApp(sessionAppId);
  if (!app) redirect("/company/events/new/sessions");
  if (!app.data.courseTitle) {
    redirect(`/company/events/new/sessions/${sessionAppId}/course`);
  }

  // Errors are re-derived from the draft the failing action just echoed back,
  // so they always line up with what is rendered below. Nothing is stored or
  // passed through the URL, and a stale ?error= over a fixed draft yields none.
  const errors = error === "validation" ? deriveStepErrors(step2WriteSchema, app.data) : {};
  return (
    <>
      <PageHeader title="Event Session" subtitle="Step 2 of 4 — Course Creator" />
      <StepErrors error={error} errors={errors} />
      <form action={saveSessionCreator} className="space-y-5">
        <input type="hidden" name="sessionAppId" value={app.id} />
        <CreatorFields draft={app.data} errors={errors} />
        <FormNav
          back={{ href: `/company/events/new/sessions/${sessionAppId}/course`, label: "Back" }}
          nextLabel="Next: Presenters"
        />
      </form>
    </>
  );
}
