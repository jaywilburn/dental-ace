import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { ApplicationStepBar } from "@/components/application-form/step-bar";
import { FormErrorBanner, FormNav } from "@/components/application-form/form-controls";
import { PresentersFields } from "@/components/application-form/steps/presenters-fields";
import { requireApplicationCredits } from "@/lib/company/credit-guards";
import { ensureDraft, getDraftData, saveStep3 } from "@/lib/forms/application/actions";

export default async function ApplicationStep3Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  await requireApplicationCredits();
  const { error, detail } = await searchParams;
  const applicationId = await ensureDraft();
  const draft = await getDraftData(applicationId);
  if (!draft.creatorName) redirect("/company/applications/new/creator");

  return (
    <>
      <PageHeader title="Course Application" subtitle="Step 4 of 6 — Presenters" />
      <ApplicationStepBar currentStep={4} />
      {error === "validation" ? <FormErrorBanner detail={detail} /> : null}
      <form action={saveStep3} className="space-y-5">
        <input type="hidden" name="applicationId" value={applicationId} />
        <PresentersFields draft={draft} />
        <FormNav
          back={{ href: "/company/applications/new/creator", label: "Back" }}
          nextLabel="Next: Quiz Builder"
        />
      </form>
    </>
  );
}
