import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { ApplicationStepBar } from "@/components/application-form/step-bar";
import { FormErrorBanner, FormNav } from "@/components/application-form/form-controls";
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
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  await requireApplicationCredits();
  const { error, detail } = await searchParams;
  const applicationId = await ensureDraft();
  const draft = await getDraftData(applicationId);
  if (!draft.presenters?.length) redirect("/company/applications/new/presenters");

  return (
    <>
      <PageHeader title="Course Application" subtitle="Step 5 of 6 — Quiz Builder · 5 questions required" />
      <ApplicationStepBar currentStep={5} />
      {error === "validation" ? <FormErrorBanner detail={detail} /> : null}
      <form action={saveStep4} className="space-y-4">
        <input type="hidden" name="applicationId" value={applicationId} />
        <QuizFields draft={draft} />
        <FormNav
          back={{ href: "/company/applications/new/presenters", label: "Back" }}
          nextLabel="Next: Review & Submit"
        />
      </form>
    </>
  );
}
