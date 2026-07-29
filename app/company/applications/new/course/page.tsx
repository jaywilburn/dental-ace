import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { ApplicationStepBar } from "@/components/application-form/step-bar";
import { FormNav } from "@/components/application-form/form-controls";
import { StepErrors } from "@/components/application-form/field-errors";
import { deriveStepErrors } from "@/lib/forms/field-errors";
import { step1Schema } from "@/lib/forms/application/schemas";
import { CourseFields } from "@/components/application-form/steps/course-fields";
import { requireApplicationCredits } from "@/lib/company/credit-guards";
import { ensureDraft, getDraftData, saveStep1 } from "@/lib/forms/application/actions";

/*
  Step 2 — Course Information. The field body is shared with the inline
  event-session sub-wizard via <CourseFields>.
*/
export default async function ApplicationCourseInfoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // ensureDraft FIRST: a revision after a rejection is free, so the credit
  // guard needs the application id to know it may skip the balance check.
  const applicationId = await ensureDraft();
  const { credits: totalCredits } = await requireApplicationCredits({ applicationId });
  const { error } = await searchParams;
  const draft = await getDraftData(applicationId);
  if (!draft.organizationName) redirect("/company/applications/new");

  // Errors are re-derived from the draft the failing action just echoed back,
  // so they always line up with what is rendered below. Nothing is stored or
  // passed through the URL, and a stale ?error= over a fixed draft yields none.
  const errors = error === "validation" ? deriveStepErrors(step1Schema, draft) : {};
  return (
    <>
      <PageHeader
        title="Course Application"
        subtitle="Step 2 of 6 — Course Information"
        action={
          <span className="rounded-full bg-ace-bg px-2.5 py-1 text-[10px] font-bold text-ace-dark">
            {totalCredits.applicationCredits} Credits Available
          </span>
        }
      />
      <ApplicationStepBar currentStep={2} />
      <StepErrors error={error} errors={errors} />
      <form action={saveStep1} className="space-y-5">
        <input type="hidden" name="applicationId" value={applicationId} />
        <CourseFields draft={draft} errors={errors} />
        <FormNav
          back={{ href: "/company/applications/new", label: "Back" }}
          nextLabel="Next: Course Creator"
        />
      </form>
    </>
  );
}
