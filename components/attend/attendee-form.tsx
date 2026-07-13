"use client";

import { useState } from "react";
import { submitAttendance, type AttendResult } from "@/lib/attend/actions";
import { COURSE_FORMATS } from "@/lib/forms/application/schemas";
import { JurisdictionOptions } from "@/components/jurisdiction-options";
import { ErrorSummary, FieldError, toDisplayErrors } from "@/components/attend/form-errors";

type CourseFormat = (typeof COURSE_FORMATS)[number];

/*
  4-step mobile attendee form: identity → affirmation → quiz → review/submit.
  The quiz arrives WITHOUT correct answers; scoring is server-side only.
*/

export type PublicQuizQuestion =
  | { type: "TF"; question: string }
  | { type: "MC"; question: string; options: string[] };

type Answer = { type: "TF"; answer: "True" | "False" } | { type: "MC"; answer: number };

// Which step each server-validated field lives on, so an invalid submission
// can jump back to the first step the attendee needs to fix.
const FIELD_STEP: Record<string, number> = {
  attendeeName: 0,
  attendeeEmail: 0,
  completionDate: 0,
  courseFormat: 0,
  licenseNumber: 0,
  licenseType: 0,
  licenseStates: 0,
  affirmed: 1,
  answers: 2,
};

export function AttendeeForm({
  token,
  quiz,
  courseFormatDefault,
}: {
  token: string;
  quiz: PublicQuizQuestion[];
  courseFormatDefault: CourseFormat;
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // How the attendee took the course, pre-filled from the course's declared
  // format. Editable to any of the four canonical options; drives the cert.
  const [courseFormat, setCourseFormat] = useState<CourseFormat>(courseFormatDefault);
  // Course completion date ("what day did you take the course?"), defaulted to
  // today. Lazy initializers (no setState-in-effect); both compute the same day
  // on server render and client hydration.
  const [today] = useState(todayISO);
  const [completedOn, setCompletedOn] = useState<string>(today);
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseType, setLicenseType] = useState("");
  // Multiple states of licensure (client "Course Completion" form, items 6-9).
  // First entry is the primary/required state; up to 5 total. The additional
  // states are gated behind an explicit "licensed in more than one state?"
  // question (client item 7).
  const [licenseStates, setLicenseStates] = useState<string[]>([""]);
  const [multiState, setMultiState] = useState(false);
  const [affirmed, setAffirmed] = useState(false);
  const [answers, setAnswers] = useState<(Answer | null)[]>(quiz.map(() => null));
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AttendResult | null>(null);
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

  function setAnswer(i: number, a: Answer) {
    setAnswers((prev) => prev.map((x, idx) => (idx === i ? a : x)));
  }

  function setStateAt(i: number, v: string) {
    setLicenseStates((prev) => prev.map((s, idx) => (idx === i ? v : s)));
  }
  function addState() {
    setLicenseStates((prev) => (prev.length >= 5 ? prev : [...prev, ""]));
  }
  function removeState(i: number) {
    setLicenseStates((prev) => prev.filter((_, idx) => idx !== i));
  }
  // Toggling "licensed in more than one state?". Choosing Yes reveals a second
  // state row; choosing No collapses back to the primary state so cleanStates
  // and the review screen only reflect that one.
  function setMulti(v: boolean) {
    setMultiState(v);
    setLicenseStates((prev) =>
      v ? (prev.length < 2 ? [...prev, ""] : prev) : [prev[0] ?? ""],
    );
  }

  // De-duped, upper-cased, non-empty states for submit + review.
  const cleanStates = Array.from(
    new Set(licenseStates.map((s) => s.trim().toUpperCase()).filter(Boolean)),
  );

  async function onSubmit() {
    setSubmitting(true);
    setFieldErrors({});
    try {
      const res = await submitAttendance({
        token,
        attendeeName: name,
        attendeeEmail: email,
        licenseNumber: licenseNumber || undefined,
        licenseType: licenseType || undefined,
        licenseStates: cleanStates,
        courseFormat,
        completionDate: completedOn,
        affirmed,
        answers: answers.filter(Boolean) as Answer[],
      });
      if (res.status === "invalid") {
        // Keep the form mounted with everything the attendee entered and jump
        // to the first step that has a failing field (token/unknown-only
        // errors stay on review; the summary shows a generic retry message).
        setFieldErrors(res.fieldErrors);
        const failingSteps = Object.keys(res.fieldErrors)
          .map((k) => FIELD_STEP[k])
          .filter((s): s is number => s !== undefined);
        if (failingSteps.length) setStep(Math.min(...failingSteps));
        return;
      }
      setResult(res);
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return <ResultView result={result} quiz={quiz} onRetake={() => { setResult(null); setStep(2); setAnswers(quiz.map(() => null)); }} />;
  }

  const allAnswered = answers.every(Boolean);

  return (
    <div className="mt-6 space-y-4">
      <ErrorSummary fieldErrors={toDisplayErrors(fieldErrors)} />
      {step === 0 && (
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
          <Field
            label="Email"
            value={email}
            onChange={(v) => {
              setEmail(v);
              clearFieldError("attendeeEmail");
            }}
            type="email"
            error={fieldErrors.attendeeEmail}
          />
          <label className="block text-sm">
            <span className="text-slate-700">Date you completed the course</span>
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
            <select
              value={licenseType}
              onChange={(e) => setLicenseType(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
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
                setStateAt(0, e.target.value);
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
            <span className="block text-sm text-slate-700">
              Are you licensed in more than one state?
            </span>
            <div className="flex gap-2">
              {([["Yes", true], ["No", false]] as const).map(([label, val]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setMulti(val)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm ${multiState === val ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {multiState && (
            <div className="space-y-2">
              <span className="block text-sm text-slate-700">
                Additional state(s) of licensure
              </span>
              {licenseStates.slice(1).map((st, idx) => {
                const i = idx + 1;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={st}
                      onChange={(e) => setStateAt(i, e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">Select another state…</option>
                      <JurisdictionOptions />
                    </select>
                    <button
                      type="button"
                      onClick={() => removeState(i)}
                      className="shrink-0 rounded-md border border-slate-300 px-2.5 py-2 text-xs text-slate-500"
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
              {licenseStates.length < 5 && (
                <button
                  type="button"
                  onClick={addState}
                  className="text-sm font-medium text-ace-dark hover:underline"
                >
                  + Add another state where you are licensed
                </button>
              )}
            </div>
          )}
          <NavButtons
            onNext={() => setStep(1)}
            nextDisabled={!name || !email || !completedOn || !cleanStates.length}
          />
        </section>
      )}

      {step === 1 && (
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
            <span>I affirm that I attended and completed this course in full.</span>
          </label>
          <FieldError messages={fieldErrors.affirmed} />
          <NavButtons onBack={() => setStep(0)} onNext={() => setStep(2)} nextDisabled={!affirmed} />
        </section>
      )}

      {step === 2 && (
        <section className="space-y-5">
          {quiz.map((q, i) => (
            <fieldset key={i} className="space-y-2">
              <legend className="text-sm font-medium text-slate-900">{i + 1}. {q.question}</legend>
              {q.type === "TF"
                ? (["True", "False"] as const).map((opt) => (
                    <Option
                      key={opt}
                      label={opt}
                      selected={answers[i]?.type === "TF" && answers[i]?.answer === opt}
                      onSelect={() => setAnswer(i, { type: "TF", answer: opt })}
                    />
                  ))
                : q.options.map((opt, j) => (
                    <Option
                      key={j}
                      label={opt}
                      selected={answers[i]?.type === "MC" && answers[i]?.answer === j}
                      onSelect={() => setAnswer(i, { type: "MC", answer: j })}
                    />
                  ))}
            </fieldset>
          ))}
          <FieldError messages={fieldErrors.answers} />
          <NavButtons onBack={() => setStep(1)} onNext={() => setStep(3)} nextDisabled={!allAnswered} />
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4">
          <p className="text-sm text-slate-700">Review and submit to claim your certificate.</p>
          <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
            <div><strong>{name}</strong></div>
            <div>{email}</div>
            <div>{licenseType} {licenseNumber} · {cleanStates.join(", ")}</div>
            <div>{courseFormat}</div>
            <div>Completed {completedOn}</div>
          </div>
          <NavButtons
            onBack={() => setStep(2)}
            onNext={onSubmit}
            nextLabel={submitting ? "Submitting…" : "Submit"}
            nextDisabled={submitting}
          />
        </section>
      )}
    </div>
  );
}

function ResultView({ result, quiz, onRetake }: { result: AttendResult; quiz: PublicQuizQuestion[]; onRetake: () => void }) {
  switch (result.status) {
    case "passed":
      return <Banner tone="ok" title="You passed!" body="Your certificate is on its way by email." />;
    case "failed":
      return (
        <div className="space-y-4">
          <Banner tone="warn" title="Not passed yet" body={result.canRetake ? "You can retake the quiz once." : "You have used all attempts for this course."} />
          {result.correctAnswers && (
            <div className="space-y-2 rounded-md border border-border bg-surface p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Correct answers</p>
              <ol className="space-y-1 text-sm text-slate-700">
                {result.correctAnswers.map((ca, i) => (
                  <li key={i}>
                    {i + 1}. {ca.type === "TF" ? ca.correctAnswer : answerText(quiz[i], ca.correctIndex)}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {result.canRetake && (
            <button onClick={onRetake} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
              Retake quiz
            </button>
          )}
        </div>
      );
    case "already_certified":
      return <Banner tone="ok" title="Already certified" body="A certificate was already issued for this email on this course." />;
    case "locked_out":
      return <Banner tone="warn" title="No attempts remaining" body="You have used all attempts for this course." />;
    case "balance_exhausted":
      return <Banner tone="warn" title="Certificates unavailable" body="The provider has run out of certificate credits." />;
    case "course_inactive":
      return <Banner tone="warn" title="Course unavailable" body="This course is no longer accepting certificate claims." />;
    case "rate_limited":
      return <Banner tone="warn" title="Too many attempts" body="Please wait a few minutes and try again." />;
    default:
      return <Banner tone="warn" title="Check your entries" body="Some details were missing or invalid." />;
  }
}

function answerText(question: PublicQuizQuestion | undefined, correctIndex: number): string {
  return question?.type === "MC" ? (question.options[correctIndex] ?? "") : "";
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

function Option({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`block w-full rounded-md border px-3 py-2 text-left text-sm ${selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"}`}
    >
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
      <button type="button" onClick={onNext} disabled={nextDisabled} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
        {nextLabel}
      </button>
    </div>
  );
}

function todayISO(): string {
  const t = new Date();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${t.getFullYear()}-${m}-${d}`;
}

function Banner({ tone, title, body }: { tone: "ok" | "warn"; title: string; body: string }) {
  return (
    <div className={`mt-6 rounded-lg border p-4 ${tone === "ok" ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-700">{body}</p>
    </div>
  );
}
