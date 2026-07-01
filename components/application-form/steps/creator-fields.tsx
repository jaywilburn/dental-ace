import {
  FormCard,
  FormField,
  FormInput,
  FormLabel,
  FormSelect,
  FormTextarea,
} from "@/components/application-form/form-controls";
import { HIGHEST_DEGREES } from "@/lib/forms/application/schemas";
import type { ApplicationData } from "@/lib/forms/application/schemas";
import { sanitizeRichText } from "@/lib/forms/application/rich-text";
import { RichTextEditor } from "@/components/application-form/rich-text-editor";

/*
  Creator step fields (application "Step 2" data). Shared by the standalone
  wizard and the inline event-session sub-wizard.
*/
export function CreatorFields({ draft }: { draft: Partial<ApplicationData> }) {
  // Re-sanitize before seeding the editor (rendered as HTML).
  const bioHtml = draft.detailedBioHtml ? sanitizeRichText(draft.detailedBioHtml) : "";

  return (
    <FormCard title="Course Creator">
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
      <FormField>
        <FormLabel required>Course Creator Email</FormLabel>
        <FormInput type="email" name="creatorEmail" defaultValue={draft.creatorEmail ?? ""} required />
      </FormField>
      <FormField>
        <FormLabel required>Course Creator Phone</FormLabel>
        <FormInput type="tel" name="creatorPhone" defaultValue={draft.creatorPhone ?? ""} required minLength={7} maxLength={40} />
      </FormField>
      <FormField fullWidth>
        <FormLabel required hint="City, State, Zip">Course Creator Address</FormLabel>
        <FormInput name="creatorAddress" defaultValue={draft.creatorAddress ?? ""} required minLength={5} maxLength={400} />
      </FormField>
      <FormField>
        <FormLabel required>Highest Earned Educational Degree</FormLabel>
        <FormSelect name="highestDegree" defaultValue={draft.highestDegree ?? HIGHEST_DEGREES[0]} options={HIGHEST_DEGREES} />
      </FormField>
      <FormField fullWidth>
        <FormLabel required hint="Universities/colleges attended, degree(s) and graduation date(s)">
          Education Part 1
        </FormLabel>
        <FormTextarea name="educationPart1" defaultValue={draft.educationPart1 ?? ""} required minLength={2} maxLength={1000} />
      </FormField>
      <FormField fullWidth>
        <FormLabel hint="Other training relevant to mentoring this course (optional)">
          Education Part 2
        </FormLabel>
        <FormTextarea name="educationPart2" defaultValue={draft.educationPart2 ?? ""} maxLength={1000} />
      </FormField>
      <FormField fullWidth>
        <FormLabel hint="Technical degree(s), college(s) attended, date(s) of graduation (optional)">
          Education Part 3
        </FormLabel>
        <FormTextarea name="educationPart3" defaultValue={draft.educationPart3 ?? ""} maxLength={1000} />
      </FormField>
      <FormField fullWidth>
        <FormLabel hint="Other applicable info. If none, type N/A">
          Education Part 4
        </FormLabel>
        <FormTextarea name="educationPart4" defaultValue={draft.educationPart4 ?? "N/A"} maxLength={1000} />
      </FormField>
      <FormField fullWidth>
        <FormLabel required hint="e.g. Research department working on dental materials for 6 years">
          Experience Relative to Course Subject Matter
        </FormLabel>
        <FormTextarea name="creatorExperience" defaultValue={draft.creatorExperience ?? ""} required minLength={10} maxLength={2000} />
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
    </FormCard>
  );
}
