import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { ApplicationStepBar } from "@/components/application-form/step-bar";
import { FormErrorBanner, FormNav } from "@/components/application-form/form-controls";
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
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  const { credits: totalCredits } = await requireApplicationCredits();
  const { error, detail } = await searchParams;
  const applicationId = await ensureDraft();
  const draft = await getDraftData(applicationId);
  if (!draft.organizationName) redirect("/company/applications/new");

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
      {error === "validation" ? <FormErrorBanner detail={detail} /> : null}
      <form action={saveStep1} className="space-y-5">
        <input type="hidden" name="applicationId" value={applicationId} />
        <CourseFields draft={draft} />
        <FormNav
          back={{ href: "/company/applications/new", label: "Back" }}
          nextLabel="Next: Course Creator"
        />
      </form>
    </>
  );
}
