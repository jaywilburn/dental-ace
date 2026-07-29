import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { ApplicationStepBar } from "@/components/application-form/step-bar";
import { FormNav } from "@/components/application-form/form-controls";
import { StepErrors } from "@/components/application-form/field-errors";
import { deriveStepErrors } from "@/lib/forms/field-errors";
import { step4Schema } from "@/lib/forms/application/schemas";
import { QuizFields } from "@/components/application-form/steps/quiz-fields";
import { requireApplicationCredits } from "@/lib/company/credit-guards";
import { ensureDraft, getDraftData, saveStep4 } from "@/lib/forms/application/actions";

/*
  Step 4 — Quiz Builder. Field body shared with the inline event-session
  sub-wizard via <QuizFields>.
*/
export default async function ApplicationStep4Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireApplicationCredits();
  const { error } = await searchParams;
  const applicationId = await ensureDraft();
  const draft = await getDraftData(applicationId);
  if (!draft.presenters?.length) redirect("/company/applications/new/presenters");

  // Errors are re-derived from the draft the failing action just echoed back,
  // so they always line up with what is rendered below. Nothing is stored or
  // passed through the URL, and a stale ?error= over a fixed draft yields none.
  const errors = error === "validation" ? deriveStepErrors(step4Schema, draft) : {};
  return (
    <>
      <PageHeader title="Course Application" subtitle="Step 5 of 6 — Quiz Builder · 5 questions required" />
      <ApplicationStepBar currentStep={5} />
      <StepErrors error={error} errors={errors} />
      <form action={saveStep4} className="space-y-4">
        <input type="hidden" name="applicationId" value={applicationId} />
        <QuizFields draft={draft} errors={errors} />
        <FormNav
          back={{ href: "/company/applications/new/presenters", label: "Back" }}
          nextLabel="Next: Review & Submit"
        />
      </form>
    </>
  );
}
