"use client";

import { useState } from "react";
import { saveInlineSessions } from "@/lib/events/event-actions";
import { FormNav } from "@/components/application-form/form-controls";

/*
  Opt 3 (SELECTIVE_INLINE) inline-session builder, laid out as Session /
  Question / Answer. Each session has a title, CE hours (0.5 increments), and
  one 4-option multiple-choice question with a marked correct answer. Rows are
  add/removable client-side; submit posts every s{i}_* field plus sessionCount
  to saveInlineSessions.
*/

export type SessionDraft = {
  name: string;
  durationHours: string;
  question: string;
  options: string[];
  correctIndex: number;
};

function blank(): SessionDraft {
  return { name: "", durationHours: "1", question: "", options: ["", "", "", ""], correctIndex: 0 };
}

const inputBase =
  "w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] text-navy outline-none transition-colors focus:border-ace focus:ring-2 focus:ring-ace/30";

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

  return (
    <form action={saveInlineSessions} className="space-y-4">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="sessionCount" value={sessions.length} />

      {sessions.map((s, i) => (
        <div key={i} className="rounded-lg border border-border bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[12px] font-semibold text-navy">Session {i + 1}</p>
            {sessions.length > 1 && (
              <button
                type="button"
                onClick={() => setSessions((prev) => prev.filter((_, idx) => idx !== i))}
                className="rounded-md border border-border px-2 py-1 text-[11px] text-text-muted hover:bg-surface"
              >
                Remove
              </button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-text-mid">Session Title</span>
              <input
                name={`s${i}_name`}
                value={s.name}
                onChange={(e) => update(i, { name: e.target.value })}
                className={inputBase}
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-text-mid">CE Hours (0.5 steps)</span>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="40"
                name={`s${i}_duration`}
                value={s.durationHours}
                onChange={(e) => update(i, { durationHours: e.target.value })}
                className={inputBase}
                required
              />
            </label>
          </div>
          <label className="mt-3 block">
            <span className="mb-1 block text-[11px] font-semibold text-text-mid">Question (multiple choice)</span>
            <input
              name={`s${i}_question`}
              value={s.question}
              onChange={(e) => update(i, { question: e.target.value })}
              className={inputBase}
              required
            />
          </label>
          <span className="mt-2 block text-[11px] font-semibold text-text-mid">Answers (select the correct one)</span>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {s.options.map((opt, j) => (
              <label key={j} className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5">
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
                  className="w-full border-0 bg-transparent p-0 text-[13px] text-navy outline-none"
                  required
                />
              </label>
            ))}
          </div>
        </div>
      ))}

      {sessions.length < 20 && (
        <button
          type="button"
          onClick={() => setSessions((prev) => [...prev, blank()])}
          className="text-[13px] font-semibold text-ace-dark hover:underline"
        >
          + Add another session
        </button>
      )}

      <FormNav back={{ href: backHref, label: "Back" }} nextLabel="Next: Review" />
    </form>
  );
}
