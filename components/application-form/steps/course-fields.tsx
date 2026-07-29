import {
  FormCard,
  FormField,
  FormInput,
  FormLabel,
  FormSelect,
} from "@/components/application-form/form-controls";
import { CountedTextarea } from "@/components/application-form/counted-fields";
import { FieldError } from "@/components/application-form/field-errors";
import { inputBase } from "@/components/application-form/form-styles";
import {
  COURSE_FORMATS,
  DELIVERY_FORMATS,
  CATEGORIES,
} from "@/lib/forms/application/schemas";
import type { ApplicationData } from "@/lib/forms/application/schemas";
import type { FieldErrors } from "@/lib/forms/field-errors";

/*
  Course Info step fields (application "Step 1" data). Shared by the standalone
  application wizard and the inline event-session sub-wizard; the caller wraps
  these in its own <form action> + hidden id + nav.

  `errors` comes from deriveStepErrors on the page: when a save fails the action
  persists the raw slice and redirects, and the page re-parses that draft with
  the same schema. So defaultValue below shows exactly what the provider typed
  and the messages line up with it.
*/

// Stored values stay "Scientific"/"Business..."; the UI shows the friendly label.
const CATEGORY_LABELS: Record<string, string> = {
  Scientific: "Scientific (Clinical)",
  "Business/Practice Management": "Business/Practice Management",
};

/** Keep a <select> on a value it actually offers. Legacy drafts (and the echo,
 *  which persists unvalidated input) can hold an off-list value; without this
 *  the browser silently falls back to option 0 and the provider never sees it. */
function pickOption<T extends string>(
  value: unknown,
  options: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && (options as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function CourseFields({
  draft,
  errors = {},
  // The SELECTIVE_INLINE event-level application relabels the outline "Event
  // Outline" with a higher ceiling (EVENT_OUTLINE_MAX); courses keep 20k.
  outlineLabel = "Course Outline",
  outlineMaxLength = 20000,
}: {
  draft: Partial<ApplicationData>;
  errors?: FieldErrors;
  outlineLabel?: string;
  outlineMaxLength?: number;
}) {
  return (
    <FormCard title="Course Information">
      <FormField fullWidth>
        <FormLabel required>Course Title</FormLabel>
        <FormInput
          id="courseTitle"
          name="courseTitle"
          defaultValue={draft.courseTitle ?? ""}
          required
          minLength={3}
          maxLength={200}
          aria-invalid={errors.courseTitle ? true : undefined}
        />
        <FieldError messages={errors.courseTitle} />
      </FormField>
      <FormField>
        <FormLabel required hint="Exact hours, e.g. 1.5">CE Credit Hours</FormLabel>
        <FormInput
          type="number"
          step="0.5"
          min="0.5"
          max="40"
          id="ceCreditHours"
          name="ceCreditHours"
          defaultValue={draft.ceCreditHours ?? ""}
          required
          aria-invalid={errors.ceCreditHours ? true : undefined}
        />
        <FieldError messages={errors.ceCreditHours} />
      </FormField>
      <FormField>
        <FormLabel required>Course Subject Matter</FormLabel>
        <select
          id="subjectMatter"
          name="subjectMatter"
          defaultValue={pickOption(draft.subjectMatter, CATEGORIES, CATEGORIES[0])}
          className={inputBase}
        >
          {CATEGORIES.map((opt) => (
            <option key={opt} value={opt}>
              {CATEGORY_LABELS[opt] ?? opt}
            </option>
          ))}
        </select>
        <FieldError messages={errors.subjectMatter} />
      </FormField>
      <FormField>
        <FormLabel required>Course Format</FormLabel>
        <FormSelect
          id="deliveryFormat"
          name="deliveryFormat"
          defaultValue={pickOption(draft.deliveryFormat, COURSE_FORMATS, COURSE_FORMATS[0])}
          options={COURSE_FORMATS}
        />
        <FieldError messages={errors.deliveryFormat} />
      </FormField>
      <FormField fullWidth>
        <FormLabel
          required
          hint="Just your primary format, this does not limit you. Once approved, you can deliver this course in any of the formats you were accredited for."
        >
          Format you will use MOST to distribute this course
        </FormLabel>
        <FormSelect
          id="primaryDistributionFormat"
          name="primaryDistributionFormat"
          defaultValue={pickOption(
            draft.primaryDistributionFormat,
            DELIVERY_FORMATS,
            DELIVERY_FORMATS[0],
          )}
          options={DELIVERY_FORMATS}
        />
        <FieldError messages={errors.primaryDistributionFormat} />
      </FormField>
      <FormField fullWidth>
        <FormLabel required hint="How does this course better enable participants to protect the public?">
          Public Protection Statement
        </FormLabel>
        <CountedTextarea
          id="publicProtectionStatement"
          name="publicProtectionStatement"
          defaultValue={draft.publicProtectionStatement ?? ""}
          required
          minLength={20}
          max={2000}
          invalid={Boolean(errors.publicProtectionStatement)}
        />
        <FieldError messages={errors.publicProtectionStatement} />
      </FormField>
      <FormField fullWidth>
        <FormLabel required hint="Quick summary, no more than 2 concise paragraphs">
          Course Short Description
        </FormLabel>
        <CountedTextarea
          id="shortDescription"
          name="shortDescription"
          defaultValue={draft.shortDescription ?? ""}
          required
          minLength={20}
          max={1500}
          invalid={Boolean(errors.shortDescription)}
          className="min-h-[110px]"
        />
        <FieldError messages={errors.shortDescription} />
      </FormField>
      <FormField fullWidth>
        <FormLabel required hint="Minimum 3, list each on a new line">
          Course Objectives
        </FormLabel>
        <CountedTextarea
          id="courseObjectives"
          name="courseObjectives"
          defaultValue={draft.courseObjectives ?? ""}
          required
          minLength={20}
          max={2000}
          invalid={Boolean(errors.courseObjectives)}
          className="min-h-[110px]"
        />
        <FieldError messages={errors.courseObjectives} />
      </FormField>
      <FormField fullWidth>
        <FormLabel required hint="Paste or type the full outline, including section timings">
          {outlineLabel}
        </FormLabel>
        <CountedTextarea
          id="courseOutline"
          name="courseOutline"
          // Legacy drafts stored a fileRef object under this key.
          defaultValue={
            typeof draft.courseOutline === "string" ? draft.courseOutline : ""
          }
          required
          minLength={1}
          max={outlineMaxLength}
          invalid={Boolean(errors.courseOutline)}
          className="min-h-[140px]"
        />
        <FieldError messages={errors.courseOutline} />
      </FormField>
    </FormCard>
  );
}
