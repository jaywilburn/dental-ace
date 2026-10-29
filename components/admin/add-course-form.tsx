"use client";

import { useActionState, useState } from "react";
import {
  FormCard,
  FormField,
  FormInput,
  FormLabel,
} from "@/components/application-form/form-controls";
import { FieldError } from "@/components/application-form/field-errors";
import { inputBase, inputInvalid } from "@/components/application-form/form-styles";
import { QuizFields } from "@/components/application-form/steps/quiz-fields";
import { CATEGORIES, COURSE_FORMATS } from "@/lib/forms/application/schemas";
import { FORM_LEVEL_KEY } from "@/lib/forms/field-errors";
import {
  ACCREDITATION_YEARS,
  COURSE_ID_MAX,
  LEGACY_COURSE_ID_MAX,
  expiryIsoFor,
  type AddCourseState,
  type AddCourseValues,
} from "@/lib/admin/course-add-rules";
import { cn } from "@/lib/utils";

/*
  Client half of /admin/companies/[id]/courses/new. A client component only so
  a rejected submit can come back with field errors AND everything the admin
  typed (useActionState): the redirect-with-?error pattern the smaller admin
  forms use would wipe five quiz questions on one typo. The form remounts on
  each rejection (key={attempt}) so the echoed values become its defaults again,
  since React 19 resets uncontrolled inputs after an action.

  "Save draft" posts the same form with intent=draft and formNoValidate, so the
  browser's required checks don't block saving half a course; the action
  redirects back here on the saved draft.
*/

type Action = (prev: AddCourseState, formData: FormData) => Promise<AddCourseState>;

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function AddCourseForm({
  action,
  companyId,
  today,
  draftId,
  draftValues,
}: {
  action: Action;
  companyId: string;
  /** YYYY-MM-DD in the app time zone; the approval date's default and max. */
  today: string;
  /** Set when continuing a saved draft. */
  draftId?: string;
  draftValues?: AddCourseValues;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <CourseFields
      key={state?.attempt ?? 0}
      formAction={formAction}
      pending={pending}
      companyId={companyId}
      today={today}
      errors={state?.errors ?? {}}
      values={state?.values ?? draftValues ?? null}
      draftId={draftId}
    />
  );
}

function CourseFields({
  formAction,
  pending,
  companyId,
  today,
  errors,
  values,
  draftId,
}: {
  formAction: (formData: FormData) => void;
  pending: boolean;
  companyId: string;
  today: string;
  errors: Record<string, string[]>;
  values: AddCourseValues | null;
  draftId?: string;
}) {
  const [approvedOn, setApprovedOn] = useState(values?.approvedOn || today);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(approvedOn);
  const errorCount = Object.keys(errors).length;
  const invalid = (key: string) => (errors[key] ? true : undefined);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="companyId" value={companyId} />
      {draftId ? <input type="hidden" name="draftId" value={draftId} /> : null}

      {errorCount > 0 ? (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-[12px] text-red-700">
          <p className="font-semibold">The course was not added.</p>
          <p>
            {errors[FORM_LEVEL_KEY]?.join(" ") ??
              `Fix the ${errorCount === 1 ? "field" : `${errorCount} fields`} marked below and try again.`}
          </p>
        </div>
      ) : null}

      <FormCard title="Course">
        <FormField>
          <FormLabel htmlFor="courseIdNumber" required hint="Printed on the letter and every certificate">
            Course ID
          </FormLabel>
          <FormInput
            id="courseIdNumber"
            name="courseIdNumber"
            defaultValue={values?.courseIdNumber ?? ""}
            required
            maxLength={COURSE_ID_MAX}
            placeholder="e.g. ACE-LEG-00124"
            autoComplete="off"
            className="font-mono"
            aria-invalid={invalid("courseIdNumber")}
          />
          <FieldError messages={errors.courseIdNumber} />
        </FormField>
        <FormField>
          <FormLabel htmlFor="legacyCourseId" hint="Optional, e.g. DA236">
            Previous course number
          </FormLabel>
          <FormInput
            id="legacyCourseId"
            name="legacyCourseId"
            defaultValue={values?.legacyCourseId ?? ""}
            maxLength={LEGACY_COURSE_ID_MAX}
            autoComplete="off"
            aria-invalid={invalid("legacyCourseId")}
          />
          <FieldError messages={errors.legacyCourseId} />
        </FormField>
        <FormField fullWidth>
          <FormLabel htmlFor="courseTitle" required>
            Course title
          </FormLabel>
          <FormInput
            id="courseTitle"
            name="courseTitle"
            defaultValue={values?.courseTitle ?? ""}
            required
            minLength={3}
            maxLength={200}
            aria-invalid={invalid("courseTitle")}
          />
          <FieldError messages={errors.courseTitle} />
        </FormField>
        <FormField>
          <FormLabel htmlFor="ceHours" required>
            CE hours
          </FormLabel>
          <FormInput
            id="ceHours"
            name="ceHours"
            type="number"
            inputMode="decimal"
            min={0.5}
            max={40}
            step={0.01}
            defaultValue={values?.ceHours ?? ""}
            required
            className="tabular-nums"
            aria-invalid={invalid("ceHours")}
          />
          <FieldError messages={errors.ceHours} />
        </FormField>
        <FormField>
          <FormLabel htmlFor="courseType" required>
            Subject
          </FormLabel>
          <select
            id="courseType"
            name="courseType"
            defaultValue={values?.courseType ?? ""}
            required
            className={cn(inputBase, errors.courseType && inputInvalid)}
            aria-invalid={invalid("courseType")}
          >
            <option value="" disabled>
              Choose a subject
            </option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <FieldError messages={errors.courseType} />
        </FormField>
        <FormField>
          <FormLabel htmlFor="deliveryMethod" required hint="Printed on the letter">
            Course format
          </FormLabel>
          <select
            id="deliveryMethod"
            name="deliveryMethod"
            defaultValue={values?.deliveryMethod ?? ""}
            required
            className={cn(inputBase, errors.deliveryMethod && inputInvalid)}
            aria-invalid={invalid("deliveryMethod")}
          >
            <option value="" disabled>
              Choose a format
            </option>
            {COURSE_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <FieldError messages={errors.deliveryMethod} />
        </FormField>
        <FormField>
          <FormLabel htmlFor="approvedOn" required hint="Today if you don't know it">
            Approval date
          </FormLabel>
          <FormInput
            id="approvedOn"
            name="approvedOn"
            type="date"
            max={today}
            value={approvedOn}
            onChange={(e) => setApprovedOn(e.target.value)}
            required
            aria-invalid={invalid("approvedOn")}
            aria-describedby="approvedOn-expiry"
          />
          <p id="approvedOn-expiry" className="mt-1 text-[11px] text-text-muted tabular-nums">
            {validDate
              ? `Accredited until ${formatDate(expiryIsoFor(approvedOn))} (${ACCREDITATION_YEARS} years).`
              : `Accreditation lasts ${ACCREDITATION_YEARS} years from this date.`}
          </p>
          <FieldError messages={errors.approvedOn} />
        </FormField>
      </FormCard>

      <div className="rounded-lg border border-border bg-white p-5">
        <p className="mb-4 border-b border-border pb-3 text-[13px] font-semibold text-navy">Certificate quiz</p>
        <div className="space-y-4">
          <QuizFields draft={{ quiz: values?.quiz }} errors={errors} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={cn(
            "rounded-md bg-navy px-4 py-2 text-[13px] font-semibold text-white hover:bg-navy/90",
            pending && "opacity-60",
          )}
        >
          {pending ? "Saving…" : "Add course"}
        </button>
        <button
          type="submit"
          name="intent"
          value="draft"
          formNoValidate
          disabled={pending}
          className={cn(
            "rounded-md border border-border bg-white px-4 py-2 text-[13px] font-semibold text-navy hover:bg-surface",
            pending && "opacity-60",
          )}
        >
          Save draft
        </button>
        <p className="basis-full text-pretty text-[11px] text-text-muted">
          Add course puts it on the company&apos;s dashboard. No application credit is used, no email is sent and it is
          recorded in the audit log. Save draft keeps what you have so far, even if fields are blank. Drafts are only
          visible to admins.
        </p>
      </div>
    </form>
  );
}
