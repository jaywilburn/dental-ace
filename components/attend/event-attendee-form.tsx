"use client";

import { useRef, useState } from "react";
import { submitEventAttendance, type EventAttendResult } from "@/lib/attend/event-actions";
import { COURSE_FORMATS } from "@/lib/forms/application/schemas";
import {
  activeQuizItems,
  selectedHoursTotal,
  type ActiveQuizItem,
  type EventPublicForm,
} from "@/lib/attend/event-form-items";
import { ATTENDANCE_CODE_MAX } from "@/lib/attend/attendance-code";
import { formatCeHours } from "@/lib/attend/format-ce-hours";
import { JurisdictionOptions } from "@/components/jurisdiction-options";
import { ErrorSummary, FieldError, toDisplayErrors } from "@/components/attend/form-errors";
import { EmailField } from "@/components/attend/email-field";
import { SubmitConfirmDialog } from "@/components/attend/submit-confirm-dialog";
import { submitConfirmCopy } from "@/lib/attend/submit-confirm";
import {
  SURVEY_FORM_KEY,
  surveyErrorKey,
  surveyVersion,
  validateSurveyResponses,
  type SurveyQuestion,
} from "@/lib/events/survey-schemas";
import {
  SurveyFields,
  countSurveyAnswered,
  type SurveyAnswers,
} from "@/components/attend/survey-fields";

type CourseFormat = (typeof COURSE_FORMATS)[number];

export type { EventPublicForm };

/*
  Event attendee form. Stages are derived, never hard-coded:
  identity -> affirm -> [select] -> quiz -> [survey] -> review. The selective
  types (Opt 3/4) add the session-selection step and only ask one question per
  selected session, titled with the session it belongs to. Companies with event
  surveys switched on add the ungraded host survey after the quiz; its answers
  survive a retake and never affect credit. Answers
  are stripped of correctness; scoring is server-side. selectedSessionIds +
  answers submit in item order so the server re-derives the same questions.

  SELECTIVE_INLINE sessions may ask for an attendance code instead of an MC
  answer (a typed text input). A passed submission cannot be retaken, so the
  review step echoes every typed code, the confirm dialog asks the attendee to
  check them, and the result lists which sessions were and were not credited.
*/

type Answer =
  | { type: "TF"; answer: "True" | "False" }
  | { type: "MC"; answer: number }
  | { type: "CODE"; answer: string };

/** An answer the attendee has actually given (a blank code does not count). */
function isAnswered(a: Answer | undefined): boolean {
  if (!a) return false;
  return a.type === "CODE" ? a.answer.trim().length > 0 : true;
}

type Stage = "identity" | "affirm" | "select" | "quiz" | "survey" | "review";

// Which stage each server-validated field lives on, so an invalid submission
// can jump back to the first stage the attendee needs to fix. Resolved against
// the derived steps array at submit time. Survey errors are keyed
// "survey.<questionId>" (or "survey" for an unreadable payload): see stageOf.
const FIELD_STAGE: Record<string, Stage> = {
  attendeeName: "identity",
  attendeeEmail: "identity",
  completionDate: "identity",
  courseFormat: "identity",
  licenseNumber: "identity",
  licenseType: "identity",
  licenseStates: "identity",
  affirmed: "affirm",
  selectedSessionIds: "select",
  answers: "quiz",
};

function stageOf(field: string): Stage | undefined {
  if (field === SURVEY_FORM_KEY || field.startsWith(`${SURVEY_FORM_KEY}.`)) return "survey";
  return FIELD_STAGE[field];
}

export function EventAttendeeForm({
  token,
  form,
  survey,
  courseFormatDefault,
}: {
  token: string;
  eventName: string;
  form: EventPublicForm;
  /** The host's ungraded survey, or null when the event has none active. */
  survey: SurveyQuestion[] | null;
  courseFormatDefault: CourseFormat;
}) {
  const selective = form.mode === "selective";
  const perSessionCredit = form.mode === "selective" && form.perSessionCredit === true;
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // How the attendee took the event, pre-filled to the event's live format and
  // editable to any of the four canonical options; drives the certificate.
  const [courseFormat, setCourseFormat] = useState<CourseFormat>(courseFormatDefault);
  const [today] = useState(todayISO);
  const [completedOn, setCompletedOn] = useState<string>(today);
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseType, setLicenseType] = useState("");
  const [licenseStates, setLicenseStates] = useState<string[]>([""]);
  // Additional states are gated behind an explicit "licensed in more than one
  // state?" question (client "Course Completion" form, item 7).
  const [multiState, setMultiState] = useState(false);
  const [affirmed, setAffirmed] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  // Survey answers, keyed by question id. Kept across a retake: the attendee
  // only re-answers the quiz.
  const [surveyAnswers, setSurveyAnswers] = useState<SurveyAnswers>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<EventAttendResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Server-side validation errors keyed by field. Non-empty only after an
  // "invalid" submit; the form stays mounted so the attendee can fix and retry.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function clearFieldError(key: string) {
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const { [key]: _drop, ...rest } = prev;
      void _drop;
      return rest;
    });
  }

  const cleanStates = Array.from(
    new Set(licenseStates.map((s) => s.trim().toUpperCase()).filter(Boolean)),
  );

  // The questions to answer, with their answer-keys + session labels, in
  // submit order (pure helper; see lib/attend/event-form-items.ts).
  const active = activeQuizItems(form, selectedIds);
  const hasCodes = active.some((a) => a.question.type === "CODE");
  // Selective events confirm before the one-and-only submission (null = no
  // confirmation step for this mode).
  const confirmCopy = submitConfirmCopy(form.mode, { hasCodes });

  // Stage flow: optional stages appear only when this form has them.
  const surveyQuestions = survey && survey.length > 0 ? survey : null;
  const steps: Stage[] = [
    "identity",
    "affirm",
    ...(selective ? (["select"] as const) : []),
    "quiz",
    ...(surveyQuestions ? (["survey"] as const) : []),
    "review",
  ];
  const stage = steps[step];
  const goNext = () => setStep((s) => Math.min(s + 1, steps.length - 1));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  // Client-side copy of the server's survey check: errors show inline (and in
  // the summary) and Next stays on this step until they are fixed.
  function onSurveyNext() {
    if (!surveyQuestions) return goNext();
    const checked = validateSurveyResponses(surveyQuestions, surveyAnswers);
    const errors: Record<string, string[]> = {};
    if (!checked.ok) {
      for (const [key, msgs] of Object.entries(checked.errors)) {
        errors[key === SURVEY_FORM_KEY ? SURVEY_FORM_KEY : surveyErrorKey(key)] = msgs;
      }
    }
    setFieldErrors((prev) => ({
      ...Object.fromEntries(Object.entries(prev).filter(([k]) => stageOf(k) !== "survey")),
      ...errors,
    }));
    if (checked.ok) {
      goNext();
      return;
    }
    // Move focus to the first question that needs attention.
    const firstId = surveyQuestions.find((q) => errors[surveyErrorKey(q.id)])?.id;
    if (firstId) {
      document
        .querySelector<HTMLElement>(
          `[data-survey-q="${firstId}"] input, [data-survey-q="${firstId}"] textarea`,
        )
        ?.focus();
    }
  }

  const allAnswered = active.length > 0 && active.every((a) => isAnswered(answers[a.key]));

  // Re-entrancy guard. The confirm dialog's button is not covered by the
  // Submit button's disabled state, so a double press would send two
  // submissions and the second would answer "already certified" over the pass.
  const submitInFlight = useRef(false);

  async function onSubmit() {
    if (submitInFlight.current) return;
    submitInFlight.current = true;
    setSubmitting(true);
    setFieldErrors({});
    try {
      const ordered = active; // already in item order
      const res = await submitEventAttendance({
        token,
        attendeeName: name,
        attendeeEmail: email,
        licenseNumber: licenseNumber || undefined,
        licenseType: licenseType || undefined,
        licenseStates: cleanStates,
        courseFormat,
        completionDate: completedOn,
        selectedSessionIds: selective ? ordered.map((a) => a.key) : [],
        affirmed,
        answers: ordered.map((a) => answers[a.key]),
        // The version lets the server spot a survey edited after this page
        // loaded and ask for a reload (lib/attend/event-actions.ts).
        ...(surveyQuestions
          ? { survey: surveyAnswers, surveyVersion: surveyVersion(surveyQuestions) }
          : {}),
      });
      if (res.status === "invalid") {
        // Keep the form mounted with everything the attendee entered and jump
        // to the first stage that has a failing field (token/unknown-only
        // errors stay on review; the summary shows a generic retry message).
        // A survey edited after this page loaded comes back as a form-level
        // "survey" error asking for a reload (a version check on the server).
        setFieldErrors(res.fieldErrors);
        const failingSteps = Object.keys(res.fieldErrors)
          // indexOf is -1 for unknown fields and for stages the current mode
          // does not have (e.g. "select" in full mode); both filter out.
          .map((k) => {
            const st = stageOf(k);
            return st ? steps.indexOf(st) : -1;
          })
          .filter((i) => i >= 0);
        if (failingSteps.length) setStep(Math.min(...failingSteps));
        return;
      }
      setResult(res);
    } finally {
      submitInFlight.current = false;
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <ResultView
        result={result}
        items={perSessionCredit ? active : []}
        onRetake={() => { setResult(null); setStep(steps.indexOf("quiz")); }}
      />
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <ErrorSummary fieldErrors={toDisplayErrors(fieldErrors)} />
      {stage === "identity" && (
        <section className="space-y-3">
          <Field
            label="Full name"
            value={name}
            onChange={(v) => {
              setName(v);
              clearFieldError("attendeeName");
            }}
            error={fieldErrors.attendeeName}
          />
          <EmailField
            value={email}
            onChange={(v) => {
              setEmail(v);
              clearFieldError("attendeeEmail");
            }}
            error={fieldErrors.attendeeEmail}
          />
          <label className="block text-sm">
            <span className="text-slate-700">Date you completed the event</span>
            <input
              type="date"
              value={completedOn}
              max={today || undefined}
              onChange={(e) => {
                setCompletedOn(e.target.value);
                clearFieldError("completionDate");
              }}
              aria-invalid={fieldErrors.completionDate ? true : undefined}
              className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${fieldErrors.completionDate ? "border-red-400" : "border-slate-300"}`}
            />
            <FieldError messages={fieldErrors.completionDate} />
          </label>
          <label className="block text-sm">
            <span className="text-slate-700">Course format</span>
            <select
              value={courseFormat}
              onChange={(e) => setCourseFormat(e.target.value as CourseFormat)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {COURSE_FORMATS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
          <Field label="License number" value={licenseNumber} onChange={setLicenseNumber} />
          <label className="block text-sm">
            <span className="text-slate-700">License type</span>
            <select value={licenseType} onChange={(e) => setLicenseType(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="">Select…</option>
              <option value="RDH">Dental Hygienist (RDH)</option>
              <option value="DDS/DMD">Dentist (DDS / DMD)</option>
              <option value="DA">Dental Assistant (DA)</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <div className="space-y-2">
            <span className="block text-sm text-slate-700">State of licensure</span>
            <select
              value={licenseStates[0] ?? ""}
              onChange={(e) => {
                setLicenseStates((p) => p.map((s, idx) => (idx === 0 ? e.target.value : s)));
                clearFieldError("licenseStates");
              }}
              aria-invalid={fieldErrors.licenseStates ? true : undefined}
              className={`w-full rounded-md border px-3 py-2 text-sm ${fieldErrors.licenseStates ? "border-red-400" : "border-slate-300"}`}
            >
              <option value="">Select your state…</option>
              <JurisdictionOptions />
            </select>
            <FieldError messages={fieldErrors.licenseStates} />
          </div>
          <div className="space-y-1">
            <span className="block text-sm text-slate-700">Are you licensed in more than one state?</span>
            <div className="flex gap-2">
              {([["Yes", true], ["No", false]] as const).map(([label, val]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setMultiState(val);
                    setLicenseStates((p) => (val ? (p.length < 2 ? [...p, ""] : p) : [p[0] ?? ""]));
                  }}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm ${multiState === val ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {multiState && (
            <div className="space-y-2">
              <span className="block text-sm text-slate-700">Additional state(s) of licensure</span>
              {licenseStates.slice(1).map((st, idx) => {
                const i = idx + 1;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={st}
                      onChange={(e) => setLicenseStates((p) => p.map((s, j) => (j === i ? e.target.value : s)))}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">Select another state…</option>
                      <JurisdictionOptions />
                    </select>
                    <button type="button" onClick={() => setLicenseStates((p) => p.filter((_, j) => j !== i))} className="shrink-0 rounded-md border border-slate-300 px-2.5 py-2 text-xs text-slate-500">
                      Remove
                    </button>
                  </div>
                );
              })}
              {licenseStates.length < 5 && (
                <button type="button" onClick={() => setLicenseStates((p) => [...p, ""])} className="text-sm font-medium text-ace-dark hover:underline">
                  + Add another state where you are licensed
                </button>
              )}
            </div>
          )}
          <NavButtons onNext={goNext} nextDisabled={!name || !email || !completedOn || !cleanStates.length} />
        </section>
      )}

      {stage === "affirm" && (
        <section className="space-y-3">
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={affirmed}
              onChange={(e) => {
                setAffirmed(e.target.checked);
                clearFieldError("affirmed");
              }}
              className="mt-1"
            />
            <span>I affirm that I attended and completed this event{selective ? "'s sessions I select below" : " in full"}.</span>
          </label>
          <FieldError messages={fieldErrors.affirmed} />
          <NavButtons onBack={goBack} onNext={goNext} nextDisabled={!affirmed} />
        </section>
      )}

      {stage === "select" && form.mode === "selective" && (
        <section className="space-y-3">
          <p className="text-sm font-medium text-slate-900">Which sessions did you attend?</p>
          {form.items.map((it) => (
            <div key={it.id} className="rounded-md border border-slate-300 p-3 text-sm">
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(it.id)}
                  onChange={(e) =>
                    setSelectedIds((p) => (e.target.checked ? [...p, it.id] : p.filter((x) => x !== it.id)))
                  }
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium text-slate-900">{it.label}</span>
                  <PresentedBy names={it.presenters} className="block text-xs text-slate-600" />
                  <span className="block text-xs text-slate-500">{it.sub}</span>
                </span>
              </label>
              {it.description ? (
                <p className="mt-2 text-xs leading-relaxed text-slate-600">{it.description}</p>
              ) : null}
              {/* Expander lives OUTSIDE the label: a summary nested inside it
                  would toggle the checkbox on tap. */}
              {it.details ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                    View details
                  </summary>
                  <div className="mt-2 space-y-2 text-xs text-slate-600">
                    {it.details.format || it.details.category ? (
                      <p>
                        <span className="font-semibold">Format:</span>{" "}
                        {[it.details.format, it.details.category].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                    {it.details.objectives ? (
                      <div>
                        <p className="font-semibold">Objectives</p>
                        <p className="whitespace-pre-line">{it.details.objectives}</p>
                      </div>
                    ) : null}
                    {it.details.outline ? (
                      <div>
                        <p className="font-semibold">Outline</p>
                        <p className="max-h-48 overflow-y-auto whitespace-pre-line">
                          {it.details.outline}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </details>
              ) : null}
            </div>
          ))}
          <FieldError messages={fieldErrors.selectedSessionIds} />
          <NavButtons onBack={goBack} onNext={goNext} nextDisabled={selectedIds.length === 0} />
        </section>
      )}

      {stage === "quiz" && (
        <section className="space-y-5">
          {active.map(({ key, label, presenters, question: q }) => (
            <fieldset key={key} className="space-y-2">
              <legend className="text-sm font-medium text-slate-900">
                {label ? (
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {label}
                  </span>
                ) : null}
                <PresentedBy names={presenters} className="mb-1 block text-xs font-normal text-slate-600" />
                {q.question}
              </legend>
              {q.type === "TF" ? (
                (["True", "False"] as const).map((opt) => (
                  <Option
                    key={opt}
                    label={opt}
                    selected={answers[key]?.type === "TF" && answers[key]?.answer === opt}
                    onSelect={() => setAnswers((p) => ({ ...p, [key]: { type: "TF", answer: opt } }))}
                  />
                ))
              ) : q.type === "CODE" ? (
                <label className="block text-sm">
                  <span className="text-slate-700">Attendance code</span>
                  <input
                    type="text"
                    value={answers[key]?.type === "CODE" ? answers[key].answer : ""}
                    onChange={(e) => {
                      const answer = e.target.value;
                      setAnswers((p) => ({ ...p, [key]: { type: "CODE", answer } }));
                      clearFieldError("answers");
                    }}
                    maxLength={ATTENDANCE_CODE_MAX}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    autoCapitalize="characters"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tracking-wide"
                  />
                  <span className="mt-1 block text-pretty text-xs text-slate-500">
                    Enter the code announced during this session. Capital letters and spaces do not matter.
                  </span>
                </label>
              ) : (
                q.options.map((opt, j) => (
                  <Option
                    key={j}
                    label={opt}
                    selected={answers[key]?.type === "MC" && answers[key]?.answer === j}
                    onSelect={() => setAnswers((p) => ({ ...p, [key]: { type: "MC", answer: j } }))}
                  />
                ))
              )}
            </fieldset>
          ))}
          <FieldError messages={fieldErrors.answers} />
          <NavButtons onBack={goBack} onNext={goNext} nextDisabled={!allAnswered} />
        </section>
      )}

      {stage === "survey" && surveyQuestions && (
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-balance text-sm font-semibold text-slate-900">Event survey</h2>
            <p className="text-pretty text-xs text-slate-600">
              A few questions from the event host. Questions marked (optional) can be skipped.
              Your answers do not affect your certificate or CE credit.
            </p>
          </div>
          <SurveyFields
            questions={surveyQuestions}
            answers={surveyAnswers}
            errors={fieldErrors}
            onChange={(id, value) => {
              setSurveyAnswers((p) => ({ ...p, [id]: value }));
              clearFieldError(surveyErrorKey(id));
              clearFieldError(SURVEY_FORM_KEY);
            }}
          />
          <FieldError messages={fieldErrors.survey} />
          <NavButtons onBack={goBack} onNext={onSurveyNext} />
        </section>
      )}

      {stage === "review" && (
        <section className="space-y-4">
          <p className="text-sm text-slate-700">Review and submit to claim your certificate.</p>
          <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
            <div><strong>{name}</strong></div>
            <div>{email}</div>
            <div>{licenseType} {licenseNumber} · {cleanStates.join(", ")}</div>
            <div>{courseFormat}</div>
            <div>Completed {completedOn}</div>
            {selective ? <div>{active.length} session{active.length === 1 ? "" : "s"} attended</div> : null}
            {surveyQuestions ? (
              <div className="tabular-nums">
                Survey: {countSurveyAnswered(surveyQuestions, surveyAnswers)} of {surveyQuestions.length} answered
              </div>
            ) : null}
            {selective && active.length > 0 ? (
              <>
                <ul className="mt-2 space-y-1.5 border-t border-slate-200 pt-2">
                  {active.map(({ key, label, presenters, hours, question }) => {
                    const a = answers[key];
                    return (
                      <li key={key} className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="font-medium text-slate-900">{label}</span>
                          <PresentedBy names={presenters} className="block text-xs text-slate-600" />
                          {/* Echo the typed code: a passed submission cannot be
                              retaken, so this is the last chance to catch a typo. */}
                          {question.type === "CODE" ? (
                            <span className="block text-xs text-slate-600">
                              Attendance code:{" "}
                              <span className="break-all font-mono font-medium text-slate-900">
                                {a?.type === "CODE" ? a.answer.trim() : ""}
                              </span>
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-xs text-slate-500 tabular-nums">{formatCeHours(hours)}</span>
                      </li>
                    );
                  })}
                </ul>
                {/* Per-session credit: only correctly answered sessions are
                    credited, so the sum of the selected sessions is a ceiling,
                    not a promise. Otherwise one overall pass earns it all. */}
                <div className="mt-2 border-t border-slate-200 pt-2">
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-medium text-slate-900">
                      {perSessionCredit ? "Maximum available" : "Total if you pass"}
                    </span>
                    <span className="shrink-0 font-medium text-slate-900">
                      {formatCeHours(selectedHoursTotal(active))}
                    </span>
                  </div>
                  {perSessionCredit ? (
                    <p className="mt-1 text-xs text-slate-500">
                      Your certificate includes the hours for each session whose question you answer correctly.
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
          {hasCodes ? (
            <p className="text-pretty text-xs text-slate-600">
              Check each attendance code above. Use Back to fix one before you submit.
            </p>
          ) : null}
          <NavButtons onBack={goBack} onNext={confirmCopy ? () => setConfirmOpen(true) : onSubmit} nextLabel={submitting ? "Submitting…" : "Submit"} nextDisabled={submitting} />
        </section>
      )}
      {confirmCopy ? (
        <SubmitConfirmDialog
          copy={confirmCopy}
          open={confirmOpen}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            void onSubmit();
          }}
        />
      ) : null}
    </div>
  );
}

function ResultView({
  result,
  items,
  onRetake,
}: {
  result: EventAttendResult;
  /** The answered sessions, for the per-session credit breakdown (else []). */
  items: ActiveQuizItem[];
  onRetake: () => void;
}) {
  switch (result.status) {
    case "passed": {
      const credited = new Set(result.creditedSessionIds);
      const missed = items.filter((it) => !credited.has(it.key));
      if (items.length === 0) {
        return <Banner tone="ok" title="You passed!" body="Your certificate is on its way by email." />;
      }
      return (
        <div className="space-y-4">
          <Banner tone="ok" title="You passed!" body="Your certificate is on its way by email." />
          <SessionList
            title="On your certificate"
            items={items.filter((it) => credited.has(it.key))}
          />
          {missed.length > 0 ? (
            <SessionList
              title="Not credited"
              note="The answer or attendance code you entered for these sessions did not match, so their hours are not on your certificate."
              items={missed}
            />
          ) : null}
        </div>
      );
    }
    case "failed":
      return (
        <div className="space-y-4">
          <Banner tone="warn" title="Not passed yet" body={result.canRetake ? "You can retake the quiz once." : "You have used all attempts for this event."} />
          {result.canRetake && (
            <button onClick={onRetake} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">Retake quiz</button>
          )}
        </div>
      );
    case "already_certified":
      return <Banner tone="ok" title="Already certified" body="A certificate was already issued for this email on this event." />;
    case "locked_out":
      return <Banner tone="warn" title="No attempts remaining" body="You have used all attempts for this event." />;
    case "balance_exhausted":
      return <Banner tone="warn" title="Certificates unavailable" body="The host has run out of certificate credits." />;
    case "event_inactive":
      return <Banner tone="warn" title="Event unavailable" body="This event is no longer accepting certificate claims." />;
    case "rate_limited":
      return <Banner tone="warn" title="Too many attempts" body="Please wait a few minutes and try again." />;
    default:
      return <Banner tone="warn" title="Check your entries" body="Some details were missing or invalid." />;
  }
}

function SessionList({ title, note, items }: { title: string; note?: string; items: ActiveQuizItem[] }) {
  return (
    <section className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
      <h3 className="text-balance font-semibold text-slate-900">{title}</h3>
      {note ? <p className="mt-1 text-pretty text-xs text-slate-600">{note}</p> : null}
      <ul className="mt-2 space-y-1.5">
        {items.map((it) => (
          <li key={it.key} className="flex items-start justify-between gap-3">
            <span className="min-w-0 font-medium text-slate-900">{it.label}</span>
            <span className="shrink-0 text-xs text-slate-500 tabular-nums">{formatCeHours(it.hours)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function todayISO(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  error?: string[];
}) {
  return (
    <label className="block text-sm">
      <span className="text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${error ? "border-red-400" : "border-slate-300"}`}
      />
      <FieldError messages={error} />
    </label>
  );
}

/** "Presented by A, B" line; renders nothing when no presenter names are known. */
function PresentedBy({ names, className }: { names?: string[]; className?: string }) {
  if (!names || names.length === 0) return null;
  return <span className={className}>Presented by {names.join(", ")}</span>;
}

function Option({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} className={`block w-full rounded-md border px-3 py-2 text-left text-sm ${selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"}`}>
      {label}
    </button>
  );
}

function NavButtons({ onBack, onNext, nextDisabled, nextLabel = "Next" }: { onBack?: () => void; onNext: () => void; nextDisabled?: boolean; nextLabel?: string }) {
  return (
    <div className="flex justify-between pt-2">
      {onBack ? (
        <button type="button" onClick={onBack} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700">Back</button>
      ) : <span />}
      <button type="button" onClick={onNext} disabled={nextDisabled} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{nextLabel}</button>
    </div>
  );
}

function Banner({ tone, title, body }: { tone: "ok" | "warn"; title: string; body: string }) {
  return (
    <div className={`mt-6 rounded-lg border p-4 ${tone === "ok" ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-700">{body}</p>
    </div>
  );
}
