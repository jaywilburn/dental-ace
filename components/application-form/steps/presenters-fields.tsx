import {
  FormCard,
  FormField,
  FormInput,
  FormLabel,
  FormSelect,
} from "@/components/application-form/form-controls";
import { CountedTextarea } from "@/components/application-form/counted-fields";
import { FieldError } from "@/components/application-form/field-errors";
import type { ApplicationData } from "@/lib/forms/application/schemas";
import type { FieldErrors } from "@/lib/forms/field-errors";

/*
  Presenters step fields (application "Step 3" data). Phase 1 ships one primary
  presenter; the schema supports up to 8. Shared by the standalone wizard and
  the inline event-session sub-wizard.

  Error keys are presenter_0_*, mapped from Zod paths like
  ["presenters", 0, "bio"] by lib/forms/field-errors.ts. z.flattenError cannot
  do this: it would collapse all six fields onto one "presenters" key.
*/
const PRESENTER_ROLES = ["Primary Presenter", "Co-Presenter", "Moderator"] as const;

export function PresentersFields({
  draft,
  errors = {},
}: {
  draft: Partial<ApplicationData>;
  errors?: FieldErrors;
}) {
  const primary = draft.presenters?.[0];
  const role =
    typeof primary?.role === "string" &&
    (PRESENTER_ROLES as readonly string[]).includes(primary.role)
      ? primary.role
      : PRESENTER_ROLES[0];

  return (
    <>
      {/* Array-level errors (.min(1) / .max(8)) have nowhere else to land. */}
      <FieldError messages={errors.presenters} />
      <FormCard title="Primary Presenter">
        <FormField>
          <FormLabel required>Presenter Name</FormLabel>
          <FormInput
            id="presenter_0_name"
            name="presenter_0_name"
            defaultValue={primary?.name ?? ""}
            required
            minLength={2}
            maxLength={200}
            aria-invalid={errors.presenter_0_name ? true : undefined}
          />
          <FieldError messages={errors.presenter_0_name} />
        </FormField>
        <FormField>
          <FormLabel required>Role</FormLabel>
          <FormSelect
            id="presenter_0_role"
            name="presenter_0_role"
            defaultValue={role}
            options={PRESENTER_ROLES}
          />
          <FieldError messages={errors.presenter_0_role} />
        </FormField>
        <FormField fullWidth>
          <FormLabel required>Commercial Disclosure</FormLabel>
          <CountedTextarea
            id="presenter_0_commercialDisclosure"
            name="presenter_0_commercialDisclosure"
            defaultValue={
              primary?.commercialDisclosure ??
              "No relevant financial relationships to disclose"
            }
            required
            minLength={2}
            max={1000}
            invalid={Boolean(errors.presenter_0_commercialDisclosure)}
          />
          <FieldError messages={errors.presenter_0_commercialDisclosure} />
        </FormField>
        <FormField fullWidth>
          <FormLabel required hint="Last Name, First Name, experience relative to course matter">
            Experience Relative to Course Matter
          </FormLabel>
          <CountedTextarea
            id="presenter_0_experience"
            name="presenter_0_experience"
            defaultValue={primary?.experience ?? ""}
            required
            minLength={2}
            max={1000}
            invalid={Boolean(errors.presenter_0_experience)}
          />
          <FieldError messages={errors.presenter_0_experience} />
        </FormField>
        <FormField fullWidth>
          <FormLabel required hint="How much time, and a description: live, paper, or digital?">
            Training Received by Presenter
          </FormLabel>
          <CountedTextarea
            id="presenter_0_training"
            name="presenter_0_training"
            defaultValue={primary?.training ?? ""}
            required
            minLength={2}
            max={1000}
            invalid={Boolean(errors.presenter_0_training)}
          />
          <FieldError messages={errors.presenter_0_training} />
        </FormField>
        <FormField fullWidth>
          <FormLabel required hint="Include name and title">Presenter Bio</FormLabel>
          <CountedTextarea
            id="presenter_0_bio"
            name="presenter_0_bio"
            defaultValue={primary?.bio ?? ""}
            required
            minLength={2}
            max={2000}
            invalid={Boolean(errors.presenter_0_bio)}
          />
          <FieldError messages={errors.presenter_0_bio} />
        </FormField>
      </FormCard>
      <p className="text-[11px] text-text-muted">
        Additional presenter slots ship in a follow-up. The schema supports up
        to 8 presenters per course.
      </p>
    </>
  );
}
