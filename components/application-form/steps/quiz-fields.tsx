import {
  FormField,
  FormInput,
  FormLabel,
} from "@/components/application-form/form-controls";
import type {
  ApplicationData,
  QuizQuestion,
} from "@/lib/forms/application/schemas";

/*
  Quiz builder fields (application "Step 4" data). Q1/Q2 True/False; Q3-Q5
  4-option multiple choice with one correct answer. Includes the rules banner.
  Shared by the standalone wizard and the inline event-session sub-wizard.
*/
export function QuizFields({ draft }: { draft: Partial<ApplicationData> }) {
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
              <FormInput name={`q${i + 1}_question`} defaultValue={q?.question ?? ""} required />
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
              <FormInput name={`q${i + 1}_question`} defaultValue={q?.question ?? ""} required />
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
