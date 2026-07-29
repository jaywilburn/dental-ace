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
import { eventSessionQuizStepSchema } from "@/lib/forms/event/schemas";
import { requireDentalAce } from "@/lib/auth/session";
import { getSessionApp } from "@/lib/events/session-data";
import { saveSessionQuiz } from "@/lib/events/session-actions";

/*
  FULL_EVENT_QUIZ per-session sub-wizard, Step 4 — Question. One 4-option
  multiple-choice question per session, which is exactly the question the
  attendee answers for this session. Uncontrolled server form seeded from the
  stored quiz's first MC question (legacy 5-question sessions prefill their
  first multiple-choice question).
*/
export default async function SessionQuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionAppId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireDentalAce();
  const { sessionAppId } = await params;
  const { error } = await searchParams;
  const app = await getSessionApp(sessionAppId);
  if (!app) redirect("/company/events/new/sessions");
  if (!app.data.presenters?.length) {
    redirect(`/company/events/new/sessions/${sessionAppId}/presenters`);
  }

  const firstMc = (app.data.quiz ?? []).find((qq) => qq.type === "MC");
  const q = firstMc && firstMc.type === "MC" ? firstMc : null;
  const options = q?.options ?? ["", "", "", ""];
  const correctIndex = q?.correctIndex ?? 0;

  // saveSessionQuiz validates through mergeApplicationStep with
  // eventSessionQuizStepSchema, i.e. wrapped as { quiz: [question] }. So the
  // issue paths are quiz[0].* and the field keys come out as q1_*, not the bare
  // question/option_N used by the SELECTIVE_INLINE question step.
  const errors =
    error === "validation"
      ? deriveStepErrors(eventSessionQuizStepSchema, {
          quiz: [
            {
              type: "MC",
              question: q?.question ?? "",
              options,
              correctIndex,
            },
          ],
        })
      : {};

  return (
    <>
      <PageHeader title="Event Session" subtitle="Step 4 of 4 — Question" />
      <StepErrors error={error} errors={errors} />
      <form action={saveSessionQuiz} className="space-y-5">
        <input type="hidden" name="sessionAppId" value={app.id} />
        <div className="space-y-4 rounded-lg border border-border bg-white p-5">
          <p className="border-b border-border pb-3 text-[13px] font-semibold text-navy">
            Session Question
          </p>
          <div>
            <FormLabel required hint="Attendees answer this one question for the session">
              Question (multiple choice)
            </FormLabel>
            <FormInput
              id="q1_question"
              name="question"
              defaultValue={q?.question ?? ""}
              required
              minLength={5}
              maxLength={500}
              aria-invalid={errors.q1_question ? true : undefined}
            />
            <FieldError messages={errors.q1_question} />
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
                <FieldError key={`err${j}`} messages={errors[`q1_option_${j}`]} />
              ))}
              <FieldError messages={errors.q1_options} />
            </div>
          </div>
        </div>
        <FormNav
          back={{
            href: `/company/events/new/sessions/${sessionAppId}/presenters`,
            label: "Back",
          }}
          nextLabel="Save session"
        />
      </form>
    </>
  );
}
