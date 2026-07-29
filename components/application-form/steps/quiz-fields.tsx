import {
  FormField,
  FormInput,
  FormLabel,
} from "@/components/application-form/form-controls";
import { FieldError } from "@/components/application-form/field-errors";
import type {
  ApplicationData,
  QuizQuestion,
} from "@/lib/forms/application/schemas";
import type { FieldErrors } from "@/lib/forms/field-errors";

/*
  Quiz builder fields (application "Step 4" data). Q1/Q2 True/False; Q3-Q5
  4-option multiple choice with one correct answer. Includes the rules banner.
  Shared by the standalone wizard and the inline event-session sub-wizard.

  Error keys are q{n}_question / q{n}_option_{j} / q{n}_correct, mapped from Zod
  paths like ["quiz", 2, "options", 1] by lib/forms/field-errors.ts.
*/
export function QuizFields({
  draft,
  errors = {},
}: {
  draft: Partial<ApplicationData>;
  errors?: FieldErrors;
}) {
  const quiz = draft.quiz ?? defaultQuiz();
  return (
    <>
      <div className="rounded-md border border-ver bg-ver-bg p-3 text-[12px] text-ver-dark">
        <p className="mb-1 font-semibold">Quiz rules</p>
        <p className="leading-relaxed">
          Q1 and Q2 must be True/False. Q3, Q4, and Q5 must be 4-answer multiple
          choice with exactly one correct answer marked. Pass threshold: 3 of 5
          correct. 1 retake allowed.
        </p>
      </div>
      {/* Quiz-level refinements (the TF/MC ordering rules) belong to no field. */}
      <FieldError messages={errors.quiz} />

      {[0, 1].map((i) => {
        const q = quiz[i];
        const isTF = q && q.type === "TF";
        const correct: "True" | "False" =
          isTF && q.correctAnswer === "False" ? "False" : "True";
        return (
          <div key={`tf${i}`} className="rounded-lg border border-border bg-white p-4">
            <p className="mb-2 text-[12px] font-semibold text-navy">
              Q{i + 1} (True/False)
            </p>
            <FormField fullWidth>
              <FormLabel required>Question Text</FormLabel>
              <FormInput
                id={`q${i + 1}_question`}
                name={`q${i + 1}_question`}
                defaultValue={q?.question ?? ""}
                required
                minLength={5}
                maxLength={500}
                aria-invalid={errors[`q${i + 1}_question`] ? true : undefined}
              />
              <FieldError messages={errors[`q${i + 1}_question`]} />
            </FormField>
            <div className="mt-2 flex gap-3 text-[12px] text-text-mid">
              {(["True", "False"] as const).map((v) => (
                <label key={v} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name={`q${i + 1}_correct`}
                    value={v}
                    defaultChecked={correct === v}
                  />
                  {v} = correct
                </label>
              ))}
            </div>
            <FieldError messages={errors[`q${i + 1}_correct`]} />
          </div>
        );
      })}

      {[2, 3, 4].map((i) => {
        const q = quiz[i];
        const isMC = q && q.type === "MC";
        const options: string[] = isMC ? q.options : ["", "", "", ""];
        const correctIdx = isMC ? q.correctIndex : 0;
        return (
          <div key={`mc${i}`} className="rounded-lg border border-border bg-white p-4">
            <p className="mb-2 text-[12px] font-semibold text-navy">
              Q{i + 1} (Multiple Choice)
            </p>
            <FormField fullWidth>
              <FormLabel required>Question Text</FormLabel>
              <FormInput
                id={`q${i + 1}_question`}
                name={`q${i + 1}_question`}
                defaultValue={q?.question ?? ""}
                required
                minLength={5}
                maxLength={500}
                aria-invalid={errors[`q${i + 1}_question`] ? true : undefined}
              />
              <FieldError messages={errors[`q${i + 1}_question`]} />
            </FormField>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {[0, 1, 2, 3].map((opt) => (
                <label
                  key={opt}
                  className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5"
                >
                  <input
                    type="radio"
                    name={`q${i + 1}_correct`}
                    value={opt}
                    defaultChecked={correctIdx === opt}
                  />
                  <FormInput
                    type="text"
                    id={`q${i + 1}_option_${opt}`}
                    name={`q${i + 1}_option_${opt}`}
                    defaultValue={options[opt] ?? ""}
                    placeholder={`Option ${opt + 1}`}
                    required
                    minLength={1}
                    maxLength={200}
                    className="border-0 bg-transparent p-0 focus:ring-0"
                  />
                </label>
              ))}
            </div>
            {[0, 1, 2, 3].map((opt) => (
              <FieldError
                key={`err${opt}`}
                messages={errors[`q${i + 1}_option_${opt}`]}
              />
            ))}
            <FieldError messages={errors[`q${i + 1}_correct`]} />
          </div>
        );
      })}
    </>
  );
}

export function defaultQuiz(): QuizQuestion[] {
  return [
    { type: "TF", question: "", correctAnswer: "True" },
    { type: "TF", question: "", correctAnswer: "True" },
    { type: "MC", question: "", options: ["", "", "", ""], correctIndex: 0 },
    { type: "MC", question: "", options: ["", "", "", ""], correctIndex: 0 },
    { type: "MC", question: "", options: ["", "", "", ""], correctIndex: 0 },
  ];
}
