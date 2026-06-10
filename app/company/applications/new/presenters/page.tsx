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
import { requireDentalAce } from "@/lib/auth/session";
import { ensureDraft, getDraftData, saveStep3 } from "@/lib/forms/application/actions";
import { FileUploadField } from "@/components/application-form/file-upload-field";

const PRESENTER_ROLES = ["Primary Presenter", "Co-Presenter", "Moderator"] as const;

/*
  Step 3 — Presenters. Phase 1 ships with a single primary presenter; the
  multi-presenter UI lands later. The schema already supports up to 8 so
  expansion is additive.
*/
export default async function ApplicationStep3Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  await requireDentalAce();
  const { error, detail } = await searchParams;
  const applicationId = await ensureDraft();
  const draft = await getDraftData(applicationId);
  if (!draft.creatorName) redirect("/company/applications/new/creator");

  const primary = draft.presenters?.[0];

  return (
    <>
      <PageHeader title="Course Application" subtitle="Step 3 of 5 — Presenters" />
      <ApplicationStepBar currentStep={3} />
      {error === "validation" ? <FormErrorBanner detail={detail} /> : null}
      <form action={saveStep3} className="space-y-5">
        <input type="hidden" name="applicationId" value={applicationId} />
        <FormCard title="Step 3 — Primary Presenter">
          <FormField>
            <FormLabel required>Presenter Name</FormLabel>
            <FormInput
              name="presenter_0_name"
              defaultValue={primary?.name ?? ""}
              required
              minLength={2}
              maxLength={200}
            />
          </FormField>
          <FormField>
            <FormLabel required>Role</FormLabel>
            <FormSelect
              name="presenter_0_role"
              defaultValue={primary?.role ?? PRESENTER_ROLES[0]}
              options={PRESENTER_ROLES}
            />
          </FormField>
          <FormField fullWidth>
            <FormLabel required>Commercial Disclosure</FormLabel>
            <FormTextarea
              name="presenter_0_commercialDisclosure"
              defaultValue={primary?.commercialDisclosure ?? "No relevant financial relationships to disclose"}
              required
              minLength={2}
              maxLength={1000}
            />
          </FormField>
          <FormField fullWidth>
            <FileUploadField
              applicationId={applicationId}
              field="headshot"
              label="Presenter Headshot"
              existingFilename={draft.headshot?.filename}
            />
          </FormField>
        </FormCard>
        <p className="text-[11px] text-text-muted">
          Additional presenter slots ship in a follow-up. The schema supports up
          to 8 presenters per course.
        </p>
        <FormNav
          back={{ href: "/company/applications/new/creator", label: "Back" }}
          nextLabel="Next: Quiz Builder"
        />
      </form>
    </>
  );
}
