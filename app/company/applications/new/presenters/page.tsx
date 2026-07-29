import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { ApplicationStepBar } from "@/components/application-form/step-bar";
import { FormNav } from "@/components/application-form/form-controls";
import { StepErrors } from "@/components/application-form/field-errors";
import { deriveStepErrors } from "@/lib/forms/field-errors";
import { step3Schema } from "@/lib/forms/application/schemas";
import { PresentersFields } from "@/components/application-form/steps/presenters-fields";
import { requireApplicationCredits } from "@/lib/company/credit-guards";
import { ensureDraft, getDraftData, saveStep3 } from "@/lib/forms/application/actions";

export default async function ApplicationStep3Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireApplicationCredits();
  const { error } = await searchParams;
  const applicationId = await ensureDraft();
  const draft = await getDraftData(applicationId);
  if (!draft.creatorName) redirect("/company/applications/new/creator");

  // Errors are re-derived from the draft the failing action just echoed back,
  // so they always line up with what is rendered below. Nothing is stored or
  // passed through the URL, and a stale ?error= over a fixed draft yields none.
  const errors = error === "validation" ? deriveStepErrors(step3Schema, draft) : {};
  return (
    <>
      <PageHeader title="Course Application" subtitle="Step 4 of 6 — Presenters" />
      <ApplicationStepBar currentStep={4} />
      <StepErrors error={error} errors={errors} />
      <form action={saveStep3} className="space-y-5">
        <input type="hidden" name="applicationId" value={applicationId} />
        <PresentersFields draft={draft} errors={errors} />
        <FormNav
          back={{ href: "/company/applications/new/creator", label: "Back" }}
          nextLabel="Next: Quiz Builder"
        />
      </form>
    </>
  );
}
