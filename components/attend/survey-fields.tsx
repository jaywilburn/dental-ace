"use client";

import type { ChangeEvent } from "react";
import {
  surveyTextMax,
  type SurveyQuestion,
} from "@/lib/events/survey-schemas";

/*
  The host survey step of the event attendee form (/attend/event/[token]).
  Ungraded: answers never affect scoring or credit. One fieldset per question
  with native radios / checkboxes / text fields so phones get their own large
  touch targets and keyboards. Validation lives in validateSurveyResponses
  (lib/events/survey-schemas.ts), run by the parent form before Next and again
  on the server; errors arrive here keyed "survey.<questionId>".
*/

export type SurveyAnswers = Record<string, string | string[]>;

/** Field-error key for one survey question (matches the submit action). */
export function surveyErrorKey(questionId: string): string {
  return `survey.${questionId}`;
}

/** Questions the attendee has given a non-blank answer to. */
export function countSurveyAnswered(
  questions: readonly SurveyQuestion[],
  answers: SurveyAnswers,
): number {
  return questions.filter((q) => {
    const a = answers[q.id];
    return Array.isArray(a) ? a.length > 0 : typeof a === "string" && a.trim().length > 0;
  }).length;
}

export function SurveyFields({
  questions,
  answers,
  errors,
  onChange,
}: {
  questions: readonly SurveyQuestion[];
  answers: SurveyAnswers;
  errors: Record<string, string[]>;
  onChange: (questionId: string, value: string | string[]) => void;
}) {
  return (
    <div className="space-y-5">
      {questions.map((q, i) => {
        const error = errors[surveyErrorKey(q.id)];
        const legendId = `survey-q-${q.id}`;
        const errorId = `survey-e-${q.id}`;
        const hintId = `survey-h-${q.id}`;
        // Choice groups describe themselves (hint + error); a text answer's
        // input carries its own counter + error description instead.
        const choice = q.type === "SINGLE_CHOICE" || q.type === "MULTI_CHOICE";
        const describedBy = choice
          ? [q.type === "MULTI_CHOICE" ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") ||
            undefined
          : undefined;
        return (
          <fieldset
            key={q.id}
            data-survey-q={q.id}
            aria-describedby={describedBy}
            className="space-y-2"
          >
            <legend id={legendId} className="text-pretty text-sm font-medium text-slate-900">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 tabular-nums">
                Question {i + 1}
              </span>
              {q.prompt}
              {q.required ? null : (
                <span className="font-normal text-slate-500"> (optional)</span>
              )}
            </legend>

            {q.type === "SINGLE_CHOICE" || q.type === "MULTI_CHOICE" ? (
              <>
                {q.type === "MULTI_CHOICE" ? (
                  <p id={hintId} className="text-xs text-slate-500">Select all that apply.</p>
                ) : null}
                <div className="space-y-2">
                  {q.options.map((opt) => {
                    const current = answers[q.id];
                    const checked =
                      q.type === "MULTI_CHOICE"
                        ? Array.isArray(current) && current.includes(opt)
                        : current === opt;
                    return (
                      <label
                        key={opt}
                        className={`flex items-start gap-2.5 rounded-md border px-3 py-2 text-sm text-slate-700 ${error ? "border-red-400" : "border-slate-300"}`}
                      >
                        <input
                          type={q.type === "MULTI_CHOICE" ? "checkbox" : "radio"}
                          name={`survey-${q.id}`}
                          value={opt}
                          checked={checked}
                          onChange={(e) => {
                            if (q.type === "SINGLE_CHOICE") {
                              onChange(q.id, opt);
                              return;
                            }
                            const prev = Array.isArray(current) ? current : [];
                            onChange(
                              q.id,
                              e.target.checked ? [...prev, opt] : prev.filter((p) => p !== opt),
                            );
                          }}
                          className="mt-0.5"
                        />
                        <span className="min-w-0 text-pretty">{opt}</span>
                      </label>
                    );
                  })}
                </div>
              </>
            ) : (
              <SurveyText
                type={q.type}
                value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""}
                onChange={(v) => onChange(q.id, v)}
                labelledBy={legendId}
                hintId={hintId}
                errorId={error ? errorId : undefined}
              />
            )}
            {error ? (
              <p id={errorId} className="mt-1 text-xs text-red-600">
                {error[0]}
              </p>
            ) : null}
          </fieldset>
        );
      })}
    </div>
  );
}

function SurveyText({
  type,
  value,
  onChange,
  labelledBy,
  hintId,
  errorId,
}: {
  type: "SHORT_TEXT" | "LONG_TEXT";
  value: string;
  onChange: (v: string) => void;
  labelledBy: string;
  hintId: string;
  errorId?: string;
}) {
  const max = surveyTextMax(type);
  // No maxLength: a paste longer than the limit is kept whole and flagged, so
  // the attendee can trim it themselves instead of losing the end silently.
  const length = value.trim().length;
  const over = length > max;
  const shared = {
    value,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    "aria-labelledby": labelledBy,
    "aria-describedby": [hintId, errorId].filter(Boolean).join(" "),
    "aria-invalid": errorId || over ? true : undefined,
    className: `w-full rounded-md border px-3 py-2 text-sm ${errorId || over ? "border-red-400" : "border-slate-300"}`,
  };
  return (
    <div>
      {type === "LONG_TEXT" ? <textarea rows={4} {...shared} /> : <input type="text" {...shared} />}
      <p
        id={hintId}
        className={`mt-1 text-right text-xs tabular-nums ${over ? "text-red-600" : "text-slate-500"}`}
      >
        {length.toLocaleString("en-US")} / {max.toLocaleString("en-US")} characters
      </p>
    </div>
  );
}
