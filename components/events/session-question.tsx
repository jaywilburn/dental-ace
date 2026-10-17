import { readInlineSessionQuestion } from "@/lib/forms/event/schemas";

/*
  One SELECTIVE_INLINE session's stored question, as shown on the company and
  reviewer event detail pages: the prompt, then the attendance code or the
  options with the correct one marked. Parsed with readInlineSessionQuestion
  (MC, CODE, or a legacy TF row); anything else renders a clear missing or
  invalid state instead of an empty list. Staff and owner views only: this
  shows the answer, so it must never be used on an attendee page.
*/
export function SessionQuestion({
  question,
  label = false,
}: {
  question: unknown;
  /** Show a small "Question" heading above the prompt (company page). */
  label?: boolean;
}) {
  const q = readInlineSessionQuestion(question);
  return (
    <div className="mt-2">
      {label ? (
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          Question
        </p>
      ) : null}
      {q === null ? (
        <p className="font-semibold text-orange-600">Question missing or invalid</p>
      ) : (
        <>
          <p className="text-text-mid">{q.question}</p>
          {q.type === "CODE" ? (
            <p className="mt-1 text-text-muted">
              Attendance code:{" "}
              <span className="break-all font-mono font-semibold text-green-700">{q.code}</span>
            </p>
          ) : (
            <ol className="mt-1 list-inside list-decimal text-text-muted">
              {(q.type === "MC" ? q.options : ["True", "False"]).map((opt, i) => {
                const correct = q.type === "MC" ? i === q.correctIndex : opt === q.correctAnswer;
                return (
                  <li key={i} className={correct ? "font-semibold text-green-700" : ""}>
                    {opt}
                    {correct ? " ✓" : ""}
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
