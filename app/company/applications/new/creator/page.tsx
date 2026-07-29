import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { ApplicationStepBar } from "@/components/application-form/step-bar";
import { FormNav } from "@/components/application-form/form-controls";
import { StepErrors } from "@/components/application-form/field-errors";
import { deriveStepErrors } from "@/lib/forms/field-errors";
import { step2WriteSchema } from "@/lib/forms/application/write-schemas";
import { CreatorFields } from "@/components/application-form/steps/creator-fields";
import { ensureDraft, getDraftData, saveStep2 } from "@/lib/forms/application/actions";
import { requireApplicationCredits } from "@/lib/company/credit-guards";

export default async function ApplicationStep2Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireApplicationCredits();
  const { error } = await searchParams;
  const applicationId = await ensureDraft();
  const draft = await getDraftData(applicationId);
  if (!draft.courseTitle) redirect("/company/applications/new/course");

  // Errors are re-derived from the draft the failing action just echoed back,
  // so they always line up with what is rendered below. Nothing is stored or
  // passed through the URL, and a stale ?error= over a fixed draft yields none.
  const errors = error === "validation" ? deriveStepErrors(step2WriteSchema, draft) : {};
  return (
    <>
      <PageHeader
        title="Course Application"
        subtitle="Step 3 of 6 — Course Creator"
      />
      <ApplicationStepBar currentStep={3} />
      <StepErrors error={error} errors={errors} />
      <form action={saveStep2} className="space-y-5">
        <input type="hidden" name="applicationId" value={applicationId} />
        <CreatorFields draft={draft} errors={errors} />
        <FormNav
          back={{ href: "/company/applications/new/course", label: "Back" }}
          nextLabel="Next: Presenters"
        />
      </form>
    </>
  );
}
