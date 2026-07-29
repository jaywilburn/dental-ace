import { FORM_LEVEL_KEY, type FieldErrors } from "@/lib/forms/field-errors";

/*
  Field-level error display for the course-application and event wizards.

  The step actions persist the raw submission and redirect with
  ?error=validation; the step page re-derives the errors from the draft
  (deriveStepErrors) and passes them here. That replaces the old single-line
  banner which showed only the FIRST Zod issue, as raw Zod English, keyed by the
  raw JSON field name ("courseObjectives: Too big: expected string to have
  <=2000 characters").

  Deliberately parallel to components/attend/form-errors.tsx rather than a
  generalization of it: those components compile into both public /attend client
  forms (the most critical mobile surface, where a regression is unrecoverable
  because there is no login and no retry), their fallback copy is
  attendee-specific, and this version needs anchor links into a much longer form
  plus a form-level bucket. The pattern is what is reused, not the markup.
*/

/** Human labels for every field the wizards post. Keys are the `name=`
 *  attributes; see lib/forms/field-errors.ts for the path mapping. */
export const APPLICATION_FIELD_LABELS: Record<string, string> = {
  // Organization / contact
  organizationName: "Organization name",
  organizationAddress: "Organization address",
  adminName: "Administrator name",
  adminEmail: "Administrator email",
  adminPhone: "Administrator phone",

  // Event details
  name: "Event name",
  eventDate: "Event date(s)",

  // Course information
  courseTitle: "Course title",
  ceCreditHours: "CE credit hours",
  subjectMatter: "Subject matter",
  deliveryFormat: "Course format",
  primaryDistributionFormat: "Primary distribution format",
  shortDescription: "Short description",
  publicProtectionStatement: "Public protection statement",
  courseObjectives: "Course objectives",
  courseOutline: "Course outline",

  // Course creator
  creatorName: "Creator name",
  credentials: "Credentials",
  currentPosition: "Current position",
  detailedBioHtml: "Detailed bio",
  creatorEmail: "Creator email",
  creatorPhone: "Creator phone",
  creatorAddress: "Creator address",
  highestDegree: "Highest degree",
  educationPart1: "Education 1",
  educationPart2: "Education 2",
  educationPart3: "Education 3",
  educationPart4: "Education 4",
  creatorExperience: "Creator experience",

  // Presenters (Phase 1 ships one primary presenter)
  presenters: "Presenters",
  presenter_0_name: "Presenter name",
  presenter_0_role: "Presenter role",
  presenter_0_commercialDisclosure: "Commercial disclosure",
  presenter_0_experience: "Presenter experience",
  presenter_0_training: "Presenter training",
  presenter_0_bio: "Presenter bio",

  // Single MC question (per-session steps)
  question: "Question",
  options: "Answer options",
  option_0: "Answer 1",
  option_1: "Answer 2",
  option_2: "Answer 3",
  option_3: "Answer 4",
  correctIndex: "Correct answer",

  // Five-question quiz (standalone wizard + admin editor)
  quiz: "Quiz",
  ...Object.fromEntries(
    Array.from({ length: 5 }, (_, i) => i + 1).flatMap((q) => [
      [`q${q}`, `Question ${q}`],
      [`q${q}_question`, `Question ${q}`],
      [`q${q}_correct`, `Question ${q} correct answer`],
      [`q${q}_options`, `Question ${q} answers`],
      ...Array.from({ length: 4 }, (_, j) => [
        `q${q}_option_${j}`,
        `Question ${q}, answer ${j + 1}`,
      ]),
    ]),
  ),
};

function labelFor(key: string): string | null {
  if (key === FORM_LEVEL_KEY) return null;
  return APPLICATION_FIELD_LABELS[key] ?? null;
}

/**
 * What a wizard step page renders above its form.
 *
 * `error` is the ?error= query param the failing action redirected with;
 * `errors` is the map re-derived from the draft. Note the summary is gated on
 * the DERIVED map, not the query param, so a stale ?error=validation left in
 * browser history over a since-fixed draft shows nothing at all.
 */
export function StepErrors({
  error,
  errors,
}: {
  error?: string;
  errors: FieldErrors;
}) {
  // A submit-time gate bounced back here because some OTHER step is unfinished,
  // so re-deriving this step's schema would (correctly) find nothing wrong.
  if (error === "incomplete") {
    return (
      <div
        role="alert"
        className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-[12px] text-red-700"
      >
        <p className="font-semibold">This is not ready to submit yet.</p>
        <p>
          Some required fields are missing or incomplete. Walk through each step
          and save it, then try again.
        </p>
      </div>
    );
  }

  if (error === "too_long") {
    return (
      <div
        role="alert"
        className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-[12px] text-red-700"
      >
        <p className="font-semibold">That was too long to save.</p>
        <p>
          We kept the first 25,000 characters of each field. Shorten your text,
          then save again.
        </p>
      </div>
    );
  }
  return <ErrorSummary errors={errors} />;
}

/** Inline message under a single control. */
export function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="mt-1 text-[11px] text-red-600">{messages.join(" ")}</p>;
}

/**
 * Summary of every problem on the step, with anchor links so a provider on a
 * long form can jump straight to the offending field. Renders nothing when
 * there are no errors, which is what makes a stale ?error=validation in browser
 * history harmless.
 */
export function ErrorSummary({ errors }: { errors: FieldErrors }) {
  const entries = Object.entries(errors);
  if (entries.length === 0) return null;

  return (
    <div
      role="alert"
      className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-[12px] text-red-700"
    >
      <p className="font-semibold">
        {entries.length === 1
          ? "This step could not be saved. Please fix the following:"
          : `This step could not be saved. Please fix the following ${entries.length} fields:`}
      </p>
      <ul className="mt-1.5 space-y-1">
        {entries.map(([key, messages]) => {
          const label = labelFor(key);
          return (
            <li key={key}>
              {label ? (
                <>
                  <a href={`#${key}`} className="font-medium underline">
                    {label}
                  </a>
                  : {messages.join(" ")}
                </>
              ) : (
                messages.join(" ")
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-red-600/90">
        Everything you typed has been kept on this page.
      </p>
    </div>
  );
}
