"use client";

import { useState } from "react";
import { submitAttendance, type AttendResult } from "@/lib/attend/actions";
import { JurisdictionOptions } from "@/components/jurisdiction-options";

/*
  4-step mobile attendee form: identity → affirmation → quiz → review/submit.
  The quiz arrives WITHOUT correct answers; scoring is server-side only.
*/

export type PublicQuizQuestion =
  | { type: "TF"; question: string }
  | { type: "MC"; question: string; options: string[] };

type Answer = { type: "TF"; answer: "True" | "False" } | { type: "MC"; answer: number };

export function AttendeeForm({ token, quiz }: { token: string; quiz: PublicQuizQuestion[] }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseType, setLicenseType] = useState("");
  const [licenseState, setLicenseState] = useState("");
  const [affirmed, setAffirmed] = useState(false);
  const [answers, setAnswers] = useState<(Answer | null)[]>(quiz.map(() => null));
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AttendResult | null>(null);

  function setAnswer(i: number, a: Answer) {
    setAnswers((prev) => prev.map((x, idx) => (idx === i ? a : x)));
  }

  async function onSubmit() {
    setSubmitting(true);
    try {
      const res = await submitAttendance({
        token,
        attendeeName: name,
        attendeeEmail: email,
        licenseNumber: licenseNumber || undefined,
        licenseType: licenseType || undefined,
        licenseStates: [licenseState.toUpperCase()],
        affirmed,
        answers: answers.filter(Boolean) as Answer[],
      });
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
      {step === 0 && (
        <section className="space-y-3">
          <Field label="Full name" value={name} onChange={setName} />
          <Field label="Email" value={email} onChange={setEmail} type="email" />
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
          <label className="block text-sm">
            <span className="text-slate-700">License state/province</span>
            <select
              value={licenseState}
              onChange={(e) => setLicenseState(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select…</option>
              <JurisdictionOptions />
            </select>
          </label>
          <NavButtons onNext={() => setStep(1)} nextDisabled={!name || !email || !licenseState} />
        </section>
      )}

      {step === 1 && (
        <section className="space-y-3">
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={affirmed} onChange={(e) => setAffirmed(e.target.checked)} className="mt-1" />
            <span>I affirm that I attended and completed this course in full.</span>
          </label>
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
          <NavButtons onBack={() => setStep(1)} onNext={() => setStep(3)} nextDisabled={!allAnswered} />
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4">
          <p className="text-sm text-slate-700">Review and submit to claim your certificate.</p>
          <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
            <div><strong>{name}</strong></div>
            <div>{email}</div>
            <div>{licenseType} {licenseNumber} · {licenseState.toUpperCase()}</div>
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

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block text-sm">
      <span className="text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
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

function Banner({ tone, title, body }: { tone: "ok" | "warn"; title: string; body: string }) {
  return (
    <div className={`mt-6 rounded-lg border p-4 ${tone === "ok" ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-700">{body}</p>
    </div>
  );
}
