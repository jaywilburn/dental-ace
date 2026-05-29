import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { ApplicationStepBar } from "@/components/application-form/step-bar";
import {
  FormCard,
  FormField,
  FormInput,
  FormLabel,
  FormNav,
  FormTextarea,
} from "@/components/application-form/form-controls";
import { requireRole } from "@/lib/auth/session";
import { ensureDraft, getDraftData, saveStep2 } from "@/lib/forms/application/actions";

export default async function ApplicationStep2Page() {
  await requireRole("CUSTOMER");
  const applicationId = await ensureDraft();
  const draft = await getDraftData(applicationId);
  if (!draft.courseTitle) redirect("/company/applications/new");

  return (
    <>
      <PageHeader
        title="Course Application"
        subtitle="Step 2 of 5 — Course Creator"
      />
      <ApplicationStepBar currentStep={2} />
      <form action={saveStep2} className="space-y-5">
        <input type="hidden" name="applicationId" value={applicationId} />
        <FormCard title="Step 2 — Creator">
          <FormField>
            <FormLabel required>Creator Name</FormLabel>
            <FormInput name="creatorName" defaultValue={draft.creatorName ?? ""} required />
          </FormField>
          <FormField>
            <FormLabel required>Credentials</FormLabel>
            <FormInput
              name="credentials"
              defaultValue={draft.credentials ?? ""}
              placeholder="DDS, FAGD — University, Year"
              required
            />
          </FormField>
          <FormField fullWidth>
            <FormLabel required>Current Position</FormLabel>
            <FormInput
              name="currentPosition"
              defaultValue={draft.currentPosition ?? ""}
              required
            />
          </FormField>
          <FormField fullWidth>
            <FormLabel required>Professional Bio</FormLabel>
            <FormTextarea
              name="professionalBio"
              defaultValue={draft.professionalBio ?? ""}
              required
              className="min-h-[120px]"
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
