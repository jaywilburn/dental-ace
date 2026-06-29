import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { ApplicationStepBar } from "@/components/application-form/step-bar";
import {
  FormCard,
  FormErrorBanner,
  FormField,
  FormInput,
  FormLabel,
  FormNav,
  FormSelect,
  FormTextarea,
} from "@/components/application-form/form-controls";
import { requireApplicationCredits } from "@/lib/company/credit-guards";
import {
  DELIVERY_FORMATS,
  CATEGORIES,
} from "@/lib/forms/application/schemas";
import { ensureDraft, getDraftData, saveStep1 } from "@/lib/forms/application/actions";

// Category display labels: stored values stay "Scientific"/"Business..." for
// data compatibility; the UI shows "Scientific (Clinical)".
const CATEGORY_LABELS: Record<string, string> = {
  Scientific: "Scientific (Clinical)",
  "Business/Practice Management": "Business/Practice Management",
};

/*
  Step 2 — Course Information. Relocated from the wizard entry (which is now the
  Organization step). Adds the short description and most-used distribution
  format, and uses the 5-option course format.
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
        <FormCard title="Step 2 — Course Information">
          <FormField fullWidth>
            <FormLabel required>Course Title</FormLabel>
            <FormInput
              name="courseTitle"
              defaultValue={draft.courseTitle ?? ""}
              required
              minLength={3}
              maxLength={200}
            />
          </FormField>
          <FormField>
            <FormLabel required hint="Exact hours, e.g. 1.5">CE Credit Hours</FormLabel>
            <FormInput
              type="number"
              step="0.5"
              min="0.5"
              max="40"
              name="ceCreditHours"
              defaultValue={draft.ceCreditHours ?? ""}
              required
            />
          </FormField>
          <FormField>
            <FormLabel required>Course Subject Matter</FormLabel>
            <select
              name="subjectMatter"
              defaultValue={draft.subjectMatter ?? CATEGORIES[0]}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] text-navy outline-none transition-colors focus:border-ace focus:ring-2 focus:ring-ace/30"
            >
              {CATEGORIES.map((opt) => (
                <option key={opt} value={opt}>
                  {CATEGORY_LABELS[opt] ?? opt}
                </option>
              ))}
            </select>
          </FormField>
          <FormField>
            <FormLabel required>Course Format</FormLabel>
            <FormSelect
              name="deliveryFormat"
              defaultValue={draft.deliveryFormat ?? DELIVERY_FORMATS[0]}
              options={DELIVERY_FORMATS}
            />
          </FormField>
          <FormField fullWidth>
            <FormLabel
              required
              hint="Just your primary format — this does not limit you. Once approved, you can deliver this course in any of the formats you were accredited for."
            >
              Format you will use MOST to distribute this course
            </FormLabel>
            <FormSelect
              name="primaryDistributionFormat"
              defaultValue={draft.primaryDistributionFormat ?? DELIVERY_FORMATS[0]}
              options={DELIVERY_FORMATS}
            />
          </FormField>
          <FormField fullWidth>
            <FormLabel required hint="How does this course better enable participants to protect the public?">
              Public Protection Statement
            </FormLabel>
            <FormTextarea
              name="publicProtectionStatement"
              defaultValue={draft.publicProtectionStatement ?? ""}
              required
              minLength={20}
              maxLength={2000}
            />
          </FormField>
          <FormField fullWidth>
            <FormLabel required hint="Quick summary, no more than 2 concise paragraphs">
              Course Short Description
            </FormLabel>
            <FormTextarea
              name="shortDescription"
              defaultValue={draft.shortDescription ?? ""}
              required
              minLength={20}
              maxLength={1500}
              className="min-h-[110px]"
            />
          </FormField>
          <FormField fullWidth>
            <FormLabel required hint="Minimum 3, list each on a new line">
              Course Objectives
            </FormLabel>
            <FormTextarea
              name="courseObjectives"
              defaultValue={draft.courseObjectives ?? ""}
              required
              minLength={20}
              maxLength={2000}
              className="min-h-[110px]"
            />
          </FormField>
          <FormField fullWidth>
            <FormLabel required hint="Paste or type the full outline, including section timings">
              Course Outline
            </FormLabel>
            <FormTextarea
              name="courseOutline"
              defaultValue={
                typeof draft.courseOutline === "string" ? draft.courseOutline : ""
              }
              required
              minLength={1}
              maxLength={20000}
              className="min-h-[140px]"
            />
          </FormField>
        </FormCard>
        <FormNav
          back={{ href: "/company/applications/new", label: "Back" }}
          nextLabel="Next: Course Creator"
        />
      </form>
    </>
  );
}
