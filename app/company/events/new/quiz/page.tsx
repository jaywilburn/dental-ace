import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import {
  FormErrorBanner,
  FormField,
  FormInput,
  FormLabel,
  FormNav,
} from "@/components/application-form/form-controls";
import { requireDentalAce } from "@/lib/auth/session";
import { ensureEventDraft, getEventDraft, saveEventQuiz } from "@/lib/events/event-actions";
import type { McQuestion } from "@/lib/forms/event/schemas";

type TF = { type: "TF"; question: string; correctAnswer: "True" | "False" };
type QuizItem = TF | McQuestion;

/*
  Event wizard (Opt 1, FULL_EVENT_QUIZ) — total event hours + a 5-question
  event-level quiz (2 True/False, 3 multiple choice). Clones the course quiz
  builder. Reachable only when the draft's type is FULL_EVENT_QUIZ.
*/
export default async function EventQuizPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  await requireDentalAce();
  const { error, detail } = await searchParams;
  const eventId = await ensureEventDraft();
  const draft = await getEventDraft(eventId);
  if (!draft?.eventType) redirect("/company/events/new/qualifiers");
  if (draft.eventType === "SELECTIVE_INLINE") redirect("/company/events/new/sessions");
  if (draft.eventType !== "FULL_EVENT_QUIZ") redirect("/company/events/new/courses");

  const quiz = (draft.data.quiz as QuizItem[] | undefined) ?? [];

  return (
    <>
      <PageHeader title="New Event" subtitle="Step 3 of 4 — Event Quiz" />
      {error === "validation" ? <FormErrorBanner detail={detail} /> : null}
      <div className="mb-4 rounded-md border border-ver bg-ver-bg p-3 text-[12px] text-ver-dark">
        Attendees receive one certificate for the full event. Set the total hours
        and a 5-question quiz: Q1 and Q2 are True/False, Q3-Q5 are 4-option
        multiple choice with one correct answer. Pass threshold: 3 of 5.
      </div>
      <form action={saveEventQuiz} className="space-y-4">
        <input type="hidden" name="eventId" value={eventId} />

        <div className="rounded-lg border border-border bg-white p-4">
          <FormField>
            <FormLabel required hint="Total CE hours for the whole event, 0.5 increments">
              Total Event Hours
            </FormLabel>
            <FormInput
              type="number"
              step="0.5"
              min="0.5"
              max="80"
              name="totalHours"
              defaultValue={draft.totalHours ?? ""}
              required
            />
          </FormField>
        </div>

        {[0, 1].map((i) => {
          const q = quiz[i];
          const isTF = q && q.type === "TF";
          const correct = isTF && q.correctAnswer === "False" ? "False" : "True";
          return (
            <div key={`tf${i}`} className="rounded-lg border border-border bg-white p-4">
              <p className="mb-2 text-[12px] font-semibold text-navy">Q{i + 1} (True/False)</p>
              <FormField fullWidth>
                <FormLabel required>Question Text</FormLabel>
                <FormInput name={`q${i + 1}_question`} defaultValue={q?.question ?? ""} required />
              </FormField>
              <div className="mt-2 flex gap-3 text-[12px] text-text-mid">
                {(["True", "False"] as const).map((v) => (
                  <label key={v} className="flex items-center gap-1.5">
                    <input type="radio" name={`q${i + 1}_correct`} value={v} defaultChecked={correct === v} />
                    {v} = correct
                  </label>
                ))}
              </div>
            </div>
          );
        })}

        {[2, 3, 4].map((i) => {
          const q = quiz[i];
          const isMC = q && q.type === "MC";
          const options = isMC ? q.options : ["", "", "", ""];
          const correctIdx = isMC ? q.correctIndex : 0;
          return (
            <div key={`mc${i}`} className="rounded-lg border border-border bg-white p-4">
              <p className="mb-2 text-[12px] font-semibold text-navy">Q{i + 1} (Multiple Choice)</p>
              <FormField fullWidth>
                <FormLabel required>Question Text</FormLabel>
                <FormInput name={`q${i + 1}_question`} defaultValue={q?.question ?? ""} required />
              </FormField>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {[0, 1, 2, 3].map((opt) => (
                  <label key={opt} className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5">
                    <input type="radio" name={`q${i + 1}_correct`} value={opt} defaultChecked={correctIdx === opt} />
                    <FormInput
                      type="text"
                      name={`q${i + 1}_option_${opt}`}
                      defaultValue={options[opt] ?? ""}
                      placeholder={`Option ${opt + 1}`}
                      required
                      className="border-0 bg-transparent p-0 focus:ring-0"
                    />
                  </label>
                ))}
              </div>
            </div>
          );
        })}

        <FormNav back={{ href: "/company/events/new/qualifiers", label: "Back" }} nextLabel="Next: Review" />
      </form>
    </>
  );
}
