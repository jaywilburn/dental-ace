import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { ApplicationStepBar } from "@/components/application-form/step-bar";
import { FormErrorBanner, FormNav } from "@/components/application-form/form-controls";
import { CreatorFields } from "@/components/application-form/steps/creator-fields";
import { ensureDraft, getDraftData, saveStep2 } from "@/lib/forms/application/actions";
import { requireApplicationCredits } from "@/lib/company/credit-guards";

export default async function ApplicationStep2Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  await requireApplicationCredits();
  const { error, detail } = await searchParams;
  const applicationId = await ensureDraft();
  const draft = await getDraftData(applicationId);
  if (!draft.courseTitle) redirect("/company/applications/new/course");

  return (
    <>
      <PageHeader
        title="Course Application"
        subtitle="Step 3 of 6 — Course Creator"
      />
      <ApplicationStepBar currentStep={3} />
      {error === "validation" ? <FormErrorBanner detail={detail} /> : null}
      <form action={saveStep2} className="space-y-5">
        <input type="hidden" name="applicationId" value={applicationId} />
        <CreatorFields draft={draft} />
        <FormNav
          back={{ href: "/company/applications/new/course", label: "Back" }}
          nextLabel="Next: Presenters"
        />
      </form>
    </>
  );
}
