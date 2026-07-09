import {
  FormCard,
  FormField,
  FormInput,
  FormLabel,
  FormSelect,
  FormTextarea,
} from "@/components/application-form/form-controls";
import {
  COURSE_FORMATS,
  DELIVERY_FORMATS,
  CATEGORIES,
} from "@/lib/forms/application/schemas";
import type { ApplicationData } from "@/lib/forms/application/schemas";

/*
  Course Info step fields (application "Step 1" data). Shared by the standalone
  application wizard and the inline event-session sub-wizard; the caller wraps
  these in its own <form action> + hidden id + nav.
*/

// Stored values stay "Scientific"/"Business..."; the UI shows the friendly label.
const CATEGORY_LABELS: Record<string, string> = {
  Scientific: "Scientific (Clinical)",
  "Business/Practice Management": "Business/Practice Management",
};

export function CourseFields({ draft }: { draft: Partial<ApplicationData> }) {
  // Tolerate legacy drafts: a stored deliveryFormat that predates the four
  // canonical COURSE_FORMATS (e.g. "Live/Online") falls back to the first
  // option rather than rendering a value that isn't in the list.
  const deliveryFormatDefault =
    draft.deliveryFormat &&
    (COURSE_FORMATS as readonly string[]).includes(draft.deliveryFormat)
      ? draft.deliveryFormat
      : COURSE_FORMATS[0];
  return (
    <FormCard title="Course Information">
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
          defaultValue={deliveryFormatDefault}
          options={COURSE_FORMATS}
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
  );
}
