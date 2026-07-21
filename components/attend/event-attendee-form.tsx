"use client";

import { useState } from "react";
import { submitEventAttendance, type EventAttendResult } from "@/lib/attend/event-actions";
import { COURSE_FORMATS } from "@/lib/forms/application/schemas";
import { activeQuizItems, type EventPublicForm } from "@/lib/attend/event-form-items";
import { JurisdictionOptions } from "@/components/jurisdiction-options";
import { ErrorSummary, FieldError, toDisplayErrors } from "@/components/attend/form-errors";

type CourseFormat = (typeof COURSE_FORMATS)[number];

export type { EventPublicForm };

/*
  Event attendee form. Full types (Opt 1/2) go identity -> affirm -> quiz; the
  selective types (Opt 3/4) insert a session-selection step and only ask one
  question per selected session, titled with the session it belongs to. Answers
  are stripped of correctness; scoring is server-side. selectedSessionIds +
  answers submit in item order so the server re-derives the same questions.
*/

type Answer = { type: "TF"; answer: "True" | "False" } | { type: "MC"; answer: number };

// Which stage each server-validated field lives on, so an invalid submission
// can jump back to the first stage the attendee needs to fix. Resolved against
// the mode-dependent steps array at submit time.
const FIELD_STAGE: Record<string, string> = {
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

export function EventAttendeeForm({
  token,
  form,
  courseFormatDefault,
}: {
  token: string;
  eventName: string;
  form: EventPublicForm;
  courseFormatDefault: CourseFormat;
}) {
  const selective = form.mode === "selective";
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
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<EventAttendResult | null>(null);
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

  // Step flow differs by mode.
  const steps = selective
    ? (["identity", "affirm", "select", "quiz", "review"] as const)
    : (["identity", "affirm", "quiz", "review"] as const);
  const stage = steps[step];

  const allAnswered = active.length > 0 && active.every((a) => answers[a.key]);

  async function onSubmit() {
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
      });
      if (res.status === "invalid") {
        // Keep the form mounted with everything the attendee entered and jump
        // to the first stage that has a failing field (token/unknown-only
        // errors stay on review; the summary shows a generic retry message).
        setFieldErrors(res.fieldErrors);
        const failingSteps = Object.keys(res.fieldErrors)
          // indexOf is -1 for unknown fields and for stages the current mode
          // does not have (e.g. "select" in full mode); both filter out.
          .map((k) => (steps as readonly string[]).indexOf(FIELD_STAGE[k] ?? ""))
          .filter((i) => i >= 0);
        if (failingSteps.length) setStep(Math.min(...failingSteps));
        return;
      }
      setResult(res);
    } finally {
      setSubmitting(false);
    }
  }

  if (result) return <ResultView result={result} onRetake={() => { setResult(null); setStep(steps.indexOf("quiz")); }} />;

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
          <NavButtons onNext={() => setStep(1)} nextDisabled={!name || !email || !completedOn || !cleanStates.length} />
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
          <NavButtons onBack={() => setStep(0)} onNext={() => setStep(2)} nextDisabled={!affirmed} />
        </section>
      )}

      {stage === "select" && form.mode === "selective" && (
        <section className="space-y-3">
          <p className="text-sm font-medium text-slate-900">Which sessions did you attend?</p>
          {form.items.map((it) => (
            <label key={it.id} className="flex items-start gap-2.5 rounded-md border border-slate-300 p-3 text-sm">
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
                <span className="block text-xs text-slate-500">{it.sub}</span>
              </span>
            </label>
          ))}
          <FieldError messages={fieldErrors.selectedSessionIds} />
          <NavButtons onBack={() => setStep(1)} onNext={() => setStep(3)} nextDisabled={selectedIds.length === 0} />
        </section>
      )}

      {stage === "quiz" && (
        <section className="space-y-5">
          {active.map(({ key, label, question: q }) => (
            <fieldset key={key} className="space-y-2">
              <legend className="text-sm font-medium text-slate-900">
                {label ? (
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {label}
                  </span>
                ) : null}
                {q.question}
              </legend>
              {q.type === "TF"
                ? (["True", "False"] as const).map((opt) => (
                    <Option
                      key={opt}
                      label={opt}
                      selected={answers[key]?.type === "TF" && answers[key]?.answer === opt}
                      onSelect={() => setAnswers((p) => ({ ...p, [key]: { type: "TF", answer: opt } }))}
                    />
                  ))
                : q.options.map((opt, j) => (
                    <Option
                      key={j}
                      label={opt}
                      selected={answers[key]?.type === "MC" && answers[key]?.answer === j}
                      onSelect={() => setAnswers((p) => ({ ...p, [key]: { type: "MC", answer: j } }))}
                    />
                  ))}
            </fieldset>
          ))}
          <FieldError messages={fieldErrors.answers} />
          <NavButtons onBack={() => setStep(selective ? 2 : 1)} onNext={() => setStep(selective ? 4 : 3)} nextDisabled={!allAnswered} />
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
          </div>
          <NavButtons onBack={() => setStep(selective ? 3 : 2)} onNext={onSubmit} nextLabel={submitting ? "Submitting…" : "Submit"} nextDisabled={submitting} />
        </section>
      )}
    </div>
  );
}

function ResultView({ result, onRetake }: { result: EventAttendResult; onRetake: () => void }) {
  switch (result.status) {
    case "passed":
      return <Banner tone="ok" title="You passed!" body="Your certificate is on its way by email." />;
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
