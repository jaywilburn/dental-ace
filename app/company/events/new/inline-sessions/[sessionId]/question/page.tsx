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
import { deriveStepErrors } from "@/lib/forms/field-errors";
import { mcQuestionSchema } from "@/lib/forms/event/schemas";
import { requireDentalAce } from "@/lib/auth/session";
import { getInlineSession } from "@/lib/events/inline-session-data";
import { saveInlineSessionQuestion } from "@/lib/events/inline-session-actions";

/*
  SELECTIVE_INLINE per-session mini-wizard, Step 4 — Question. One 4-option
  multiple-choice question per session (a correct answer earns that session's
  hours on the attendee certificate). Uncontrolled server form seeded from the
  stored question; no client component.
*/
export default async function InlineSessionQuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireDentalAce();
  const { sessionId } = await params;
  const { error } = await searchParams;
  const session = await getInlineSession(sessionId);
  if (!session) redirect("/company/events/new/sessions");
  if (!session.data.presenters?.length) {
    redirect(`/company/events/new/inline-sessions/${sessionId}/presenters`);
  }

  const q =
    (session.question as
      | { question?: string; options?: string[]; correctIndex?: number }
      | null) ?? {};
  const options = q.options ?? ["", "", "", ""];
  const correctIndex = q.correctIndex ?? 0;

  // Re-derived from the question the failing action echoed back, so option_N
  // errors land on the right box.
  const errors =
    error === "validation"
      ? deriveStepErrors(mcQuestionSchema, { type: "MC", question: q.question ?? "", options, correctIndex })
      : {};

  return (
    <>
      <PageHeader title="Event Session" subtitle="Step 4 of 4 — Question" />
      <StepErrors error={error} errors={errors} />
      <form action={saveInlineSessionQuestion} className="space-y-5">
        <input type="hidden" name="sessionId" value={session.id} />
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
              defaultValue={q.question ?? ""}
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
