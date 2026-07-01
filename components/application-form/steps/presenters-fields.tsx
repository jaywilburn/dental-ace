import {
  FormCard,
  FormField,
  FormInput,
  FormLabel,
  FormSelect,
  FormTextarea,
} from "@/components/application-form/form-controls";
import type { ApplicationData } from "@/lib/forms/application/schemas";

/*
  Presenters step fields (application "Step 3" data). Phase 1 ships one primary
  presenter; the schema supports up to 8. Shared by the standalone wizard and
  the inline event-session sub-wizard.
*/
const PRESENTER_ROLES = ["Primary Presenter", "Co-Presenter", "Moderator"] as const;

export function PresentersFields({ draft }: { draft: Partial<ApplicationData> }) {
  const primary = draft.presenters?.[0];
  return (
    <>
      <FormCard title="Primary Presenter">
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
          <FormLabel required hint="Last Name, First Name, experience relative to course matter">
            Experience Relative to Course Matter
          </FormLabel>
          <FormTextarea
            name="presenter_0_experience"
            defaultValue={primary?.experience ?? ""}
            required
            minLength={2}
            maxLength={1000}
          />
        </FormField>
        <FormField fullWidth>
          <FormLabel required hint="How much time, and a description: live, paper, or digital?">
            Training Received by Presenter
          </FormLabel>
          <FormTextarea
            name="presenter_0_training"
            defaultValue={primary?.training ?? ""}
            required
            minLength={2}
            maxLength={1000}
          />
        </FormField>
        <FormField fullWidth>
          <FormLabel required hint="Include name and title">Presenter Bio</FormLabel>
          <FormTextarea
            name="presenter_0_bio"
            defaultValue={primary?.bio ?? ""}
            required
            minLength={2}
            maxLength={2000}
          />
        </FormField>
      </FormCard>
      <p className="text-[11px] text-text-muted">
        Additional presenter slots ship in a follow-up. The schema supports up
        to 8 presenters per course.
      </p>
    </>
  );
}
