"use client";

import { useState } from "react";
import { saveInlineSessions } from "@/lib/events/event-actions";
import { FormNav } from "@/components/application-form/form-controls";
import {
  CATEGORIES,
  COURSE_FORMATS,
  DELIVERY_FORMATS,
} from "@/lib/forms/application/schemas";

/*
  Opt 3 (SELECTIVE_INLINE) inline-session builder. Each session carries its own
  full Course Information section (the application step1 fields) plus one
  4-option multiple-choice question with a marked correct answer. Cards are
  add/removable and collapsible client-side; collapsed card inputs stay in the
  DOM (hidden, not <details>) so every s{i}_* field still posts. Saving is
  tolerant of partly-filled sessions (the strict per-session gate runs at
  submit), so no `required` attributes here: a browser-blocked submit on a
  field inside a collapsed card would be invisible to the user.
*/

export type SessionDraft = {
  courseTitle: string;
  ceCreditHours: string;
  subjectMatter: string;
  deliveryFormat: string;
  primaryDistributionFormat: string;
  shortDescription: string;
  publicProtectionStatement: string;
  courseObjectives: string;
  courseOutline: string;
  question: string;
  options: string[];
  correctIndex: number;
};

function blank(): SessionDraft {
  return {
    courseTitle: "",
    ceCreditHours: "1",
    subjectMatter: CATEGORIES[0],
    deliveryFormat: COURSE_FORMATS[0],
    primaryDistributionFormat: DELIVERY_FORMATS[0],
    shortDescription: "",
    publicProtectionStatement: "",
    courseObjectives: "",
    courseOutline: "",
    question: "",
    options: ["", "", "", ""],
    correctIndex: 0,
  };
}

// Live "will this pass the submit gate" indicator; the server re-checks with
// sessionCourseInfoSchema + mcQuestionSchema at submit.
function draftComplete(s: SessionDraft): boolean {
  const hours = Number(s.ceCreditHours);
  return (
    s.courseTitle.trim().length >= 3 &&
    hours >= 0.5 &&
    hours <= 40 &&
    Number.isInteger(hours * 2) &&
    s.shortDescription.trim().length >= 20 &&
    s.publicProtectionStatement.trim().length >= 20 &&
    s.courseObjectives.trim().length >= 20 &&
    s.courseOutline.trim().length >= 1 &&
    s.question.trim().length >= 5 &&
    s.options.every((o) => o.trim().length > 0)
  );
}

// Stored values stay "Scientific"/"Business..."; the UI shows the friendly
// label (mirrors CourseFields).
const CATEGORY_LABELS: Record<string, string> = {
  Scientific: "Scientific (Clinical)",
  "Business/Practice Management": "Business/Practice Management",
};

const inputBase =
  "w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] text-navy outline-none transition-colors focus:border-ace focus:ring-2 focus:ring-ace/30";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-text-mid">
        {label}
        {hint ? (
          <span className="ml-1 font-normal text-text-muted">{hint}</span>
        ) : null}
      </span>
      {children}
    </label>
  );
}

export function InlineSessionsForm({
  eventId,
  initial,
  backHref,
}: {
  eventId: string;
  initial: SessionDraft[];
  backHref: string;
}) {
  const [sessions, setSessions] = useState<SessionDraft[]>(
    initial.length > 0 ? initial : [blank()],
  );
  // Expanded state per card: a lone (fresh) session starts open, an existing
  // list starts collapsed to summaries; newly added cards open.
  const [expanded, setExpanded] = useState<boolean[]>(() =>
    initial.length > 0 ? initial.map(() => false) : [true],
  );

  function update(i: number, patch: Partial<SessionDraft>) {
    setSessions((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function setOption(i: number, j: number, v: string) {
    setSessions((prev) =>
      prev.map((s, idx) =>
        idx === i ? { ...s, options: s.options.map((o, oi) => (oi === j ? v : o)) } : s,
      ),
    );
  }
  function toggle(i: number) {
    setExpanded((prev) => prev.map((e, idx) => (idx === i ? !e : e)));
  }
  function addSession() {
    setSessions((prev) => [...prev, blank()]);
    setExpanded((prev) => [...prev, true]);
  }
  function removeSession(i: number) {
    setSessions((prev) => prev.filter((_, idx) => idx !== i));
    setExpanded((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <form action={saveInlineSessions} className="space-y-4">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="sessionCount" value={sessions.length} />

      {sessions.map((s, i) => {
        const complete = draftComplete(s);
        const isOpen = expanded[i] ?? false;
        return (
          <div key={i} className="rounded-lg border border-border bg-white">
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggle(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle(i);
                }
              }}
              aria-expanded={isOpen}
              className="flex cursor-pointer items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-[12px] font-semibold text-navy">
                  Session {i + 1}
                  {s.courseTitle ? (
                    <span className="font-medium text-text-mid"> · {s.courseTitle}</span>
                  ) : (
                    <span className="font-medium text-text-muted"> · Untitled session</span>
                  )}
                </p>
                <p className="mt-0.5 text-[11px] text-text-muted">
                  {Number(s.ceCreditHours) > 0 ? `${Number(s.ceCreditHours).toFixed(1)} CE hours` : "Hours not set"}
                  {" · "}
                  {complete ? (
                    <span className="font-semibold text-green-700">✓ Complete</span>
                  ) : (
                    <span className="font-semibold text-orange-600">⚠ Incomplete</span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {sessions.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSession(i);
                    }}
                    className="rounded-md border border-border px-2 py-1 text-[11px] text-text-muted hover:bg-surface"
                  >
                    Remove
                  </button>
                )}
                <span aria-hidden className="text-[11px] text-text-muted">
                  {isOpen ? "▲" : "▼"}
                </span>
              </div>
            </div>

            <div className={isOpen ? "space-y-3 border-t border-border p-4" : "hidden"}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Course Information
              </p>
              <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
                <Field label="Course Title">
                  <input
                    name={`s${i}_courseTitle`}
                    value={s.courseTitle}
                    onChange={(e) => update(i, { courseTitle: e.target.value })}
                    className={inputBase}
                    maxLength={200}
                  />
                </Field>
                <Field label="CE Hours" hint="0.5 steps">
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="40"
                    name={`s${i}_ceCreditHours`}
                    value={s.ceCreditHours}
                    onChange={(e) => update(i, { ceCreditHours: e.target.value })}
                    className={inputBase}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Course Subject Matter">
                  <select
                    name={`s${i}_subjectMatter`}
                    value={s.subjectMatter}
                    onChange={(e) => update(i, { subjectMatter: e.target.value })}
                    className={inputBase}
                  >
                    {CATEGORIES.map((opt) => (
                      <option key={opt} value={opt}>
                        {CATEGORY_LABELS[opt] ?? opt}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Course Format">
                  <select
                    name={`s${i}_deliveryFormat`}
                    value={s.deliveryFormat}
                    onChange={(e) => update(i, { deliveryFormat: e.target.value })}
                    className={inputBase}
                  >
                    {COURSE_FORMATS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field
                label="Format you will use MOST to distribute this course"
                hint="Just your primary format; this does not limit you."
              >
                <select
                  name={`s${i}_primaryDistributionFormat`}
                  value={s.primaryDistributionFormat}
                  onChange={(e) => update(i, { primaryDistributionFormat: e.target.value })}
                  className={inputBase}
                >
                  {DELIVERY_FORMATS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Course Short Description" hint="Quick summary, no more than 2 concise paragraphs">
                <textarea
                  name={`s${i}_shortDescription`}
                  value={s.shortDescription}
                  onChange={(e) => update(i, { shortDescription: e.target.value })}
                  className={`${inputBase} min-h-[90px]`}
                  maxLength={1500}
                />
              </Field>
              <Field
                label="Public Protection Statement"
                hint="How does this session better enable participants to protect the public?"
              >
                <textarea
                  name={`s${i}_publicProtectionStatement`}
                  value={s.publicProtectionStatement}
                  onChange={(e) => update(i, { publicProtectionStatement: e.target.value })}
                  className={`${inputBase} min-h-[90px]`}
                  maxLength={2000}
                />
              </Field>
              <Field label="Course Objectives" hint="Minimum 3, list each on a new line">
                <textarea
                  name={`s${i}_courseObjectives`}
                  value={s.courseObjectives}
                  onChange={(e) => update(i, { courseObjectives: e.target.value })}
                  className={`${inputBase} min-h-[90px]`}
                  maxLength={2000}
                />
              </Field>
              <Field label="Course Outline" hint="Paste or type the full outline, including section timings">
                <textarea
                  name={`s${i}_courseOutline`}
                  value={s.courseOutline}
                  onChange={(e) => update(i, { courseOutline: e.target.value })}
                  className={`${inputBase} min-h-[120px]`}
                  maxLength={20000}
                />
              </Field>

              <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Question
              </p>
              <Field label="Question (multiple choice)">
                <input
                  name={`s${i}_question`}
                  value={s.question}
                  onChange={(e) => update(i, { question: e.target.value })}
                  className={inputBase}
                  maxLength={500}
                />
              </Field>
              <span className="block text-[11px] font-semibold text-text-mid">
                Answers (select the correct one)
              </span>
              <div className="grid gap-2 sm:grid-cols-2">
                {s.options.map((opt, j) => (
                  <label
                    key={j}
                    className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5"
                  >
                    <input
                      type="radio"
                      name={`s${i}_correct`}
                      value={j}
                      checked={s.correctIndex === j}
                      onChange={() => update(i, { correctIndex: j })}
                    />
                    <input
                      type="text"
                      name={`s${i}_option_${j}`}
                      value={opt}
                      onChange={(e) => setOption(i, j, e.target.value)}
                      placeholder={`Option ${j + 1}`}
                      maxLength={200}
                      className="w-full border-0 bg-transparent p-0 text-[13px] text-navy outline-none"
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      {sessions.length < 20 && (
        <button
          type="button"
          onClick={addSession}
          className="text-[13px] font-semibold text-ace-dark hover:underline"
        >
          + Add another session
        </button>
      )}

      <FormNav back={{ href: backHref, label: "Back" }} nextLabel="Save and Continue" />
    </form>
  );
}
