import {
  SURVEY_TYPE_LABEL,
  type SurveyQuestion,
} from "@/lib/events/survey-schemas";

/*
  Read-only list of an event's attendee survey (events.survey, already parsed
  with parseStoredSurvey), for the staff event detail page. Each question shows
  its prompt, type, required flag and, for choice questions, the options. The
  survey is ungraded, so there is no correct answer to mark.
*/
export function SurveyPreview({ questions }: { questions: readonly SurveyQuestion[] }) {
  if (questions.length === 0) {
    return <p className="text-[12px] text-text-muted">This event has no survey questions yet.</p>;
  }
  return (
    <ol className="space-y-3 text-[12px]">
      {questions.map((q, i) => (
        <li key={q.id}>
          <p className="text-pretty font-semibold text-navy">
            Q{i + 1}. {q.prompt}
          </p>
          <p className="text-[11px] text-text-muted">
            {SURVEY_TYPE_LABEL[q.type]} · {q.required ? "Required" : "Optional"}
          </p>
          {"options" in q ? (
            <ul className="mt-1 list-inside list-disc text-text-mid">
              {q.options.map((opt) => (
                <li key={opt}>{opt}</li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
