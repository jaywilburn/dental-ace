import {
  FormCard,
  FormField,
  FormInput,
  FormLabel,
  FormSelect,
} from "@/components/application-form/form-controls";
import { CountedTextarea } from "@/components/application-form/counted-fields";
import { FieldError } from "@/components/application-form/field-errors";
import { HIGHEST_DEGREES } from "@/lib/forms/application/schemas";
import type { ApplicationData } from "@/lib/forms/application/schemas";
import { sanitizeRichText } from "@/lib/forms/application/rich-text";
import { RichTextEditor } from "@/components/application-form/rich-text-editor";
import { DETAILED_BIO_PLAIN_MAX } from "@/lib/forms/application/bio-limits";
import type { FieldErrors } from "@/lib/forms/field-errors";

/*
  Creator step fields (application "Step 2" data). Shared by the standalone
  wizard and the inline event-session sub-wizard.

  `errors` is derived on the page from the draft (see course-fields.tsx), so the
  values below are what the provider typed even when the save was rejected.
*/
export function CreatorFields({
  draft,
  errors = {},
}: {
  draft: Partial<ApplicationData>;
  errors?: FieldErrors;
}) {
  // Re-sanitize before seeding the editor (rendered as HTML).
  const bioHtml = draft.detailedBioHtml ? sanitizeRichText(draft.detailedBioHtml) : "";
  const degree =
    typeof draft.highestDegree === "string" &&
    (HIGHEST_DEGREES as readonly string[]).includes(draft.highestDegree)
      ? draft.highestDegree
      : HIGHEST_DEGREES[0];

  return (
    <FormCard title="Course Creator">
      <FormField>
        <FormLabel required>Creator Name</FormLabel>
        <FormInput
          id="creatorName"
          name="creatorName"
          defaultValue={draft.creatorName ?? ""}
          required
          minLength={2}
          maxLength={200}
          aria-invalid={errors.creatorName ? true : undefined}
        />
        <FieldError messages={errors.creatorName} />
      </FormField>
      <FormField>
        <FormLabel required>Credentials</FormLabel>
        <FormInput
          id="credentials"
          name="credentials"
          defaultValue={draft.credentials ?? ""}
          placeholder="DDS, FAGD (University, Year)"
          required
          minLength={2}
          maxLength={200}
          aria-invalid={errors.credentials ? true : undefined}
        />
        <FieldError messages={errors.credentials} />
      </FormField>
      <FormField fullWidth>
        <FormLabel required>Current Position</FormLabel>
        <FormInput
          id="currentPosition"
          name="currentPosition"
          defaultValue={draft.currentPosition ?? ""}
          required
          minLength={2}
          maxLength={200}
          aria-invalid={errors.currentPosition ? true : undefined}
        />
        <FieldError messages={errors.currentPosition} />
      </FormField>
      <FormField>
        <FormLabel required>Course Creator Email</FormLabel>
        <FormInput
          type="email"
          id="creatorEmail"
          name="creatorEmail"
          defaultValue={draft.creatorEmail ?? ""}
          required
          maxLength={200}
          aria-invalid={errors.creatorEmail ? true : undefined}
        />
        <FieldError messages={errors.creatorEmail} />
      </FormField>
      <FormField>
        <FormLabel required>Course Creator Phone</FormLabel>
        <FormInput
          type="tel"
          id="creatorPhone"
          name="creatorPhone"
          defaultValue={draft.creatorPhone ?? ""}
          required
          minLength={7}
          maxLength={40}
          aria-invalid={errors.creatorPhone ? true : undefined}
        />
        <FieldError messages={errors.creatorPhone} />
      </FormField>
      <FormField fullWidth>
        <FormLabel required hint="City, State, Zip">Course Creator Address</FormLabel>
        <FormInput
          id="creatorAddress"
          name="creatorAddress"
          defaultValue={draft.creatorAddress ?? ""}
          required
          minLength={5}
          maxLength={400}
          aria-invalid={errors.creatorAddress ? true : undefined}
        />
        <FieldError messages={errors.creatorAddress} />
      </FormField>
      <FormField>
        <FormLabel required>Highest Earned Educational Degree</FormLabel>
        <FormSelect
          id="highestDegree"
          name="highestDegree"
          defaultValue={degree}
          options={HIGHEST_DEGREES}
        />
        <FieldError messages={errors.highestDegree} />
      </FormField>
      <FormField fullWidth>
        <FormLabel required hint="Universities/colleges attended, degree(s) and graduation date(s)">
          Education Part 1
        </FormLabel>
        <CountedTextarea
          id="educationPart1"
          name="educationPart1"
          defaultValue={draft.educationPart1 ?? ""}
          required
          minLength={2}
          max={1000}
          invalid={Boolean(errors.educationPart1)}
        />
        <FieldError messages={errors.educationPart1} />
      </FormField>
      <FormField fullWidth>
        <FormLabel hint="Other training relevant to mentoring this course (optional)">
          Education Part 2
        </FormLabel>
        <CountedTextarea
          id="educationPart2"
          name="educationPart2"
          defaultValue={draft.educationPart2 ?? ""}
          max={1000}
          invalid={Boolean(errors.educationPart2)}
        />
        <FieldError messages={errors.educationPart2} />
      </FormField>
      <FormField fullWidth>
        <FormLabel hint="Technical degree(s), college(s) attended, date(s) of graduation (optional)">
          Education Part 3
        </FormLabel>
        <CountedTextarea
          id="educationPart3"
          name="educationPart3"
          defaultValue={draft.educationPart3 ?? ""}
          max={1000}
          invalid={Boolean(errors.educationPart3)}
        />
        <FieldError messages={errors.educationPart3} />
      </FormField>
      <FormField fullWidth>
        <FormLabel hint="Other applicable info. If none, type N/A">
          Education Part 4
        </FormLabel>
        <CountedTextarea
          id="educationPart4"
          name="educationPart4"
          defaultValue={draft.educationPart4 ?? "N/A"}
          max={1000}
          invalid={Boolean(errors.educationPart4)}
        />
        <FieldError messages={errors.educationPart4} />
      </FormField>
      <FormField fullWidth>
        <FormLabel required hint="e.g. Research department working on dental materials for 6 years">
          Experience Relative to Course Subject Matter
        </FormLabel>
        <CountedTextarea
          id="creatorExperience"
          name="creatorExperience"
          defaultValue={draft.creatorExperience ?? ""}
          required
          minLength={10}
          max={2000}
          invalid={Boolean(errors.creatorExperience)}
        />
        <FieldError messages={errors.creatorExperience} />
      </FormField>
      <FormField fullWidth>
        <FormLabel required hint="Formatting toolbar works on phones too">
          Detailed Bio
        </FormLabel>
        <RichTextEditor
          name="detailedBioHtml"
          defaultHtml={bioHtml}
          maxPlainLength={DETAILED_BIO_PLAIN_MAX}
          invalid={Boolean(errors.detailedBioHtml)}
          placeholder="Education, credentials, clinical experience, teaching history..."
        />
        <FieldError messages={errors.detailedBioHtml} />
      </FormField>
    </FormCard>
  );
}
