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
} from "@/components/application-form/form-controls";
import { ensureDraft, getDraftData, saveStep2 } from "@/lib/forms/application/actions";
import { requireApplicationCredits } from "@/lib/company/credit-guards";
import { sanitizeRichText } from "@/lib/forms/application/rich-text";
import { FileUploadField } from "@/components/application-form/file-upload-field";
import { RichTextEditor } from "@/components/application-form/rich-text-editor";

export default async function ApplicationStep2Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  await requireApplicationCredits();
  const { error, detail } = await searchParams;
  const applicationId = await ensureDraft();
  const draft = await getDraftData(applicationId);
  if (!draft.courseTitle) redirect("/company/applications/new");

  // Re-sanitize before seeding the editor: the editor renders this as HTML.
  const bioHtml = draft.detailedBioHtml ? sanitizeRichText(draft.detailedBioHtml) : "";

  return (
    <>
      <PageHeader
        title="Course Application"
        subtitle="Step 2 of 5 — Course Creator"
      />
      <ApplicationStepBar currentStep={2} />
      {error === "validation" ? <FormErrorBanner detail={detail} /> : null}
      <form action={saveStep2} className="space-y-5">
        <input type="hidden" name="applicationId" value={applicationId} />
        <FormCard title="Step 2 — Creator">
          <FormField>
            <FormLabel required>Creator Name</FormLabel>
            <FormInput
              name="creatorName"
              defaultValue={draft.creatorName ?? ""}
              required
              minLength={2}
              maxLength={200}
            />
          </FormField>
          <FormField>
            <FormLabel required>Credentials</FormLabel>
            <FormInput
              name="credentials"
              defaultValue={draft.credentials ?? ""}
              placeholder="DDS, FAGD (University, Year)"
              required
              minLength={2}
              maxLength={200}
            />
          </FormField>
          <FormField fullWidth>
            <FormLabel required>Current Position</FormLabel>
            <FormInput
              name="currentPosition"
              defaultValue={draft.currentPosition ?? ""}
              required
              minLength={2}
              maxLength={200}
            />
          </FormField>
          <FormField fullWidth>
            <FormLabel required hint="Formatting toolbar works on phones too">
              Detailed Bio
            </FormLabel>
            <RichTextEditor
              name="detailedBioHtml"
              defaultHtml={bioHtml}
              placeholder="Education, credentials, clinical experience, teaching history..."
            />
          </FormField>
          <FormField fullWidth>
            <FileUploadField
              applicationId={applicationId}
              field="cvResume"
              label="CV / Resume"
              existingFilename={draft.cvResume?.filename}
            />
          </FormField>
        </FormCard>
        <FormNav
          back={{ href: "/company/applications/new", label: "Back" }}
          nextLabel="Next: Presenters"
        />
      </form>
    </>
  );
}
