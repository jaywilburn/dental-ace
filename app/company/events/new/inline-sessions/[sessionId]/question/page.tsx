import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import {
  FormInput,
  FormLabel,
  FormNav,
} from "@/components/application-form/form-controls";
import {
  StepErrors,
  FieldError,
} from "@/components/application-form/field-errors";
import { deriveStepErrors, FORM_LEVEL_KEY, type FieldErrors } from "@/lib/forms/field-errors";
import { codeQuestionSchema, mcQuestionSchema } from "@/lib/forms/event/schemas";
import { duplicateCodeIds, ATTENDANCE_CODE_MAX } from "@/lib/attend/attendance-code";
import { requireDentalAce } from "@/lib/auth/session";
import { getInlineSession } from "@/lib/events/inline-session-data";
import { saveInlineSessionQuestion } from "@/lib/events/inline-session-actions";
import { cn } from "@/lib/utils";

/*
  SELECTIVE_INLINE per-session mini-wizard, Step 4 — Question. One question per
  session (a correct answer earns that session's hours on the attendee
  certificate): a 4-option multiple-choice question, or, when the company has
  attendance codes on, a code announced in the session that attendees type.
  Uncontrolled server form seeded from the stored question; no client
  component. The type picker is two ?type= links (server-rendered, like the
  ?tab= pattern on the company event page), shown only when codes are on or the
  stored question is already a code (so a provider whose feature was turned off
  can still switch back to multiple choice).
*/

type QuestionType = "MC" | "CODE";

const DEFAULT_CODE_PROMPT = "Enter the attendance code announced during this session.";

export default async function InlineSessionQuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ error?: string; type?: string }>;
}) {
  await requireDentalAce();
  const { sessionId } = await params;
  const { error, type } = await searchParams;
  const session = await getInlineSession(sessionId);
  if (!session) redirect("/company/events/new/sessions");
  if (!session.data.presenters?.length) {
    redirect(`/company/events/new/inline-sessions/${sessionId}/presenters`);
  }

  const q =
    (session.question as
      | { type?: string; question?: string; options?: string[]; correctIndex?: number; code?: string }
      | null) ?? {};
  const storedType: QuestionType = q.type === "CODE" ? "CODE" : "MC";
  const showPicker = session.attendanceCodesEnabled || storedType === "CODE";
  const requested = type === "CODE" || type === "MC" ? type : null;
  const selected: QuestionType = showPicker && requested ? requested : storedType;
  // Switching type via the picker starts that form fresh rather than reading
  // the other type's fields.
  const seeded = selected === storedType;
  const basePath = `/company/events/new/inline-sessions/${sessionId}/question`;

  const options = seeded && q.options ? q.options : ["", "", "", ""];
  const correctIndex = seeded ? (q.correctIndex ?? 0) : 0;
  const prompt = seeded ? (q.question ?? "") : "";
  const code = seeded ? (q.code ?? "") : "";

  // Re-derived from the question the failing action echoed back, so option_N
  // errors land on the right box. Duplicate codes are re-derived the same way
  // (against the event's other sessions), so a stale ?error= shows nothing.
  let errors: FieldErrors = {};
  if (error === "validation" || error === "codes_disabled") {
    if (selected === "MC") {
      errors = deriveStepErrors(mcQuestionSchema, { type: "MC", question: prompt, options, correctIndex });
    } else {
      errors = deriveStepErrors(codeQuestionSchema, { type: "CODE", question: prompt, code });
      if (
        !errors.code &&
        code &&
        duplicateCodeIds([...session.siblingCodes, { id: session.id, code }]).has(session.id)
      ) {
        errors.code = ["Another session in this event already uses this code. Each session needs its own code."];
      }
      if (!session.attendanceCodesEnabled) {
        errors[FORM_LEVEL_KEY] = [
          "Attendance codes are not turned on for your organization. Choose Multiple choice for this session.",
        ];
      }
    }
  }

  return (
    <>
      <PageHeader title="Event Session" subtitle="Step 4 of 4 — Question" />
      <StepErrors error={error} errors={errors} />
      {showPicker ? (
        <nav className="mb-4 flex gap-1 border-b border-border" aria-label="Question type">
          {(["MC", "CODE"] as const).map((t) => (
            <Link
              key={t}
              href={`${basePath}?type=${t}`}
              aria-current={selected === t ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-[12px]",
                selected === t
                  ? "border-ace font-semibold text-navy"
                  : "border-transparent font-medium text-text-muted hover:text-navy",
              )}
            >
              {t === "MC" ? "Multiple choice" : "Attendance code"}
            </Link>
          ))}
        </nav>
      ) : null}
      <form action={saveInlineSessionQuestion} className="space-y-5">
        <input type="hidden" name="sessionId" value={session.id} />
        <input type="hidden" name="questionType" value={selected} />
        {selected === "CODE" ? (
          <div className="space-y-4 rounded-lg border border-border bg-white p-5">
            <p className="border-b border-border pb-3 text-[13px] font-semibold text-navy">
              Attendance Code
            </p>
            <p className="text-pretty text-[12px] text-text-mid">
              Announce this code during the session. Attendees type it on the certificate form to earn
              the session&apos;s hours. Capital letters and spaces are ignored; hyphens and other
              characters count. Each session in this event needs a different code.
            </p>
            <div>
              <FormLabel required hint="Shown to attendees above the code box">
                Prompt
              </FormLabel>
              <FormInput
                id="question"
                name="question"
                defaultValue={seeded ? prompt : DEFAULT_CODE_PROMPT}
                required
                minLength={5}
                maxLength={500}
                aria-invalid={errors.question ? true : undefined}
              />
              <FieldError messages={errors.question} />
            </div>
            <div>
              <FormLabel required hint="At least 4 characters, not counting spaces">
                Attendance code
              </FormLabel>
              <FormInput
                id="code"
                name="code"
                defaultValue={code}
                required
                maxLength={ATTENDANCE_CODE_MAX}
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                aria-invalid={errors.code ? true : undefined}
              />
              <FieldError messages={errors.code} />
            </div>
          </div>
        ) : (
          <div className="space-y-4 rounded-lg border border-border bg-white p-5">
            <p className="border-b border-border pb-3 text-[13px] font-semibold text-navy">
              Session Question
            </p>
            <div>
              <FormLabel required hint="Attendees answer this after selecting the session">
                Question (multiple choice)
              </FormLabel>
              <FormInput
                id="question"
                name="question"
                defaultValue={prompt}
                required
                minLength={5}
                maxLength={500}
                aria-invalid={errors.question ? true : undefined}
              />
              <FieldError messages={errors.question} />
            </div>
            <div>
              <span className="mb-1.5 block text-[11px] font-semibold text-text-mid">
                Answers
                <span className="ml-2 text-[10px] font-normal text-text-muted">
                  select the correct one
                </span>
              </span>
              <div className="space-y-2">
                {[0, 1, 2, 3].map((j) => (
                  <label
                    key={j}
                    className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2"
                  >
                    <input
                      type="radio"
                      name="correctIndex"
                      value={j}
                      defaultChecked={correctIndex === j}
                    />
                    <input
                      type="text"
                      id={`option_${j}`}
                      name={`option_${j}`}
                      defaultValue={options[j] ?? ""}
                      placeholder={`Option ${j + 1}`}
                      required
                      minLength={1}
                      maxLength={200}
                      className="w-full border-0 bg-transparent p-0 text-[13px] text-navy outline-none"
                    />
                  </label>
                ))}
                {[0, 1, 2, 3].map((j) => (
                  <FieldError key={`err${j}`} messages={errors[`option_${j}`]} />
                ))}
                <FieldError messages={errors.options} />
              </div>
            </div>
          </div>
        )}
        <FormNav
          back={{
            href: `/company/events/new/inline-sessions/${sessionId}/presenters`,
            label: "Back",
          }}
          nextLabel="Save session"
        />
      </form>
    </>
  );
}
