"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormLabel, FormTextarea } from "@/components/application-form/form-controls";
import { FieldError } from "@/components/application-form/field-errors";
import { inputBase, inputInvalid } from "@/components/application-form/form-styles";
import {
  SURVEY_FORM_KEY,
  SURVEY_MAX_QUESTIONS,
  SURVEY_OPTIONS_MAX,
  SURVEY_OPTIONS_MIN,
  SURVEY_OPTION_MAX,
  SURVEY_PROMPT_MAX,
  SURVEY_QUESTION_TYPES,
  SURVEY_TYPE_LABEL,
  isChoiceType,
  type SurveyFieldErrors,
  type SurveyQuestion,
  type SurveyQuestionType,
} from "@/lib/events/survey-schemas";
import type { SurveySaveAction, SurveySaveState } from "@/lib/events/survey-save-state";
import {
  appendCopiedQuestions,
  effectiveCopySource,
  type CopiedSurveyQuestion,
  type SurveyCopySource,
} from "@/lib/events/survey-copy";
import { cn } from "@/lib/utils";

/*
  Shared editor for an event's attendee survey, mounted on the company event
  page (Survey tab) and the admin survey page. The page passes the matching
  server action; this component never decides who may save.

  The whole list is held in client state and posted as JSON in one hidden
  input, so reordering, deleting and type changes are a single save. Each
  draft has a stable client `key` for React and for error placement; only
  persisted questions send their `id` (the server assigns ids and keeps one
  only for the same question and type, see normalizeSurveyInput).

  Server errors come back keyed by list index ("2.prompt", "3.options.1").
  They are mapped to draft keys using the order captured at submit, so a
  question moved after a failed save keeps its own messages.

  No drag and drop and no animation: Move up / Move down buttons are keyboard
  and screen-reader friendly by default.

  "Copy questions from another event" (copySources, same company only, loaded
  by the page) appends that event's questions as new unsaved drafts. It is all
  or nothing against SURVEY_MAX_QUESTIONS, and nothing persists until Save.
*/

type Draft = {
  key: string;
  id?: string;
  /** Type as last saved; a change means the server will issue a new id. */
  savedType?: SurveyQuestionType;
  type: SurveyQuestionType;
  prompt: string;
  required: boolean;
  /** Kept while the type is a text type, so switching back restores them. */
  options: string[];
};

/** Per-question field errors: "prompt", "type", "options", "options.1"... */
type QuestionErrors = Record<string, string[]>;
type MappedErrors = { form: string[]; byKey: Record<string, QuestionErrors> };

const NO_ERRORS: MappedErrors = { form: [], byKey: {} };

let tempSeq = 0;
const tempKey = () => `new-${++tempSeq}`;

function fromQuestion(q: SurveyQuestion): Draft {
  return {
    key: q.id,
    id: q.id,
    savedType: q.type,
    type: q.type,
    prompt: q.prompt,
    required: q.required,
    options: isChoiceType(q.type) && "options" in q ? [...q.options] : [],
  };
}

/** A copied question becomes a brand-new draft: fresh key, no id. */
function fromCopy(q: CopiedSurveyQuestion): Draft {
  return {
    key: tempKey(),
    type: q.type,
    prompt: q.prompt,
    required: q.required,
    options: "options" in q ? [...q.options] : [],
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function toPayload(d: Draft) {
  const base = { id: d.id, type: d.type, prompt: d.prompt, required: d.required };
  return isChoiceType(d.type) ? { ...base, options: d.options } : base;
}

function mapErrors(errors: SurveyFieldErrors, keys: readonly string[]): MappedErrors {
  const out: MappedErrors = { form: [], byKey: {} };
  for (const [path, messages] of Object.entries(errors)) {
    const [head, ...rest] = path.split(".");
    const index = Number(head);
    const key = path === SURVEY_FORM_KEY || !Number.isInteger(index) ? undefined : keys[index];
    if (key === undefined) {
      out.form.push(...messages);
      continue;
    }
    // A bare index is a bad or missing discriminator: it belongs on the type.
    const field = rest.length ? rest.join(".") : "type";
    const bucket = (out.byKey[key] ??= {});
    (bucket[field] ??= []).push(...messages);
  }
  return out;
}

function countErrors(e: MappedErrors): number {
  return (
    e.form.length +
    Object.values(e.byKey).reduce((n, q) => n + Object.keys(q).length, 0)
  );
}

export function SurveyEditor({
  eventId,
  initial,
  action,
  copySources = [],
}: {
  eventId: string;
  initial: SurveyQuestion[];
  action: SurveySaveAction;
  /** Other events of the same company with at least one survey question. */
  copySources?: SurveyCopySource[];
}) {
  const [state, formAction, pending] = useActionState<SurveySaveState, FormData>(action, null);
  const [drafts, setDrafts] = useState<Draft[]>(() => initial.map(fromQuestion));
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<MappedErrors>(NO_ERRORS);
  const [submittedKeys, setSubmittedKeys] = useState<string[]>([]);
  const [seenState, setSeenState] = useState<SurveySaveState>(state);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ id: string; fallback?: string } | null>(null);
  const [copyFrom, setCopyFrom] = useState(copySources[0]?.eventId ?? "");
  // Derived at render (and read by the handler): a refreshed copySources list
  // can drop the remembered id, so the select and the button fall back to the
  // first source together.
  const copySource = effectiveCopySource(copySources, copyFrom);
  const [copyNotice, setCopyNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Adopt each new action result once (adjusting state during render rather
  // than in an effect, so the saved list never flashes the old ids).
  if (state !== seenState) {
    setSeenState(state);
    if (state?.ok) {
      setDrafts(state.questions.map(fromQuestion));
      setErrors(NO_ERRORS);
      setDirty(false);
      // "Save to keep them" is no longer true once they are saved.
      setCopyNotice(null);
    } else if (state) {
      setErrors(mapErrors(state.errors, submittedKeys));
    }
  }

  // Focus moves after the DOM settles: a moved card's button, or the list
  // heading once a deleted card (and the dialog's return target) is gone.
  useEffect(() => {
    if (!focusRequest) return;
    const el =
      document.getElementById(focusRequest.id) ??
      (focusRequest.fallback ? document.getElementById(focusRequest.fallback) : null);
    if (el instanceof HTMLButtonElement && el.disabled && focusRequest.fallback) {
      document.getElementById(focusRequest.fallback)?.focus();
    } else if (el) {
      el.focus();
    } else {
      headingRef.current?.focus();
    }
  }, [focusRequest]);

  const atMax = drafts.length >= SURVEY_MAX_QUESTIONS;
  const savedAt = state?.ok ? state.savedAt : null;
  const errorCount = countErrors(errors);

  function edit(key: string, field: string | null, change: (d: Draft) => Draft) {
    setDrafts((list) => list.map((d) => (d.key === key ? change(d) : d)));
    setDirty(true);
    if (field) {
      // Editing a field clears its message. Adding or removing an option
      // ("options") shifts every option's index, so it clears them all.
      const stale = (f: string) =>
        f === field || (field === "options" && f.startsWith("options."));
      setErrors((e) => {
        const q = e.byKey[key];
        if (!q || !Object.keys(q).some(stale)) return e;
        const rest = Object.fromEntries(Object.entries(q).filter(([f]) => !stale(f)));
        return { ...e, byKey: { ...e.byKey, [key]: rest } };
      });
    }
  }

  function addQuestion() {
    if (atMax) return;
    const key = tempKey();
    setDrafts((list) => [
      ...list,
      { key, type: "SINGLE_CHOICE", prompt: "", required: false, options: ["", ""] },
    ]);
    setDirty(true);
    setFocusRequest({ id: `${key}-prompt` });
  }

  function copyQuestions() {
    const source = effectiveCopySource(copySources, copyFrom);
    if (!source) return;
    const result = appendCopiedQuestions(drafts, source.questions, SURVEY_MAX_QUESTIONS, fromCopy);
    if (!result.ok) {
      setCopyNotice({
        ok: false,
        text:
          result.room === 0
            ? `The survey already has ${SURVEY_MAX_QUESTIONS} questions, the limit. Delete some before copying.`
            : `${source.label} has ${plural(result.needed, "question", "questions")}, but only ${result.room} more ${result.room === 1 ? "fits" : "fit"} (limit ${SURVEY_MAX_QUESTIONS}). Nothing was added.`,
      });
      return;
    }
    setDrafts(result.list);
    setDirty(true);
    setCopyNotice({
      ok: true,
      text: `Added ${plural(result.added, "question", "questions")} from ${source.label}. Save to keep them.`,
    });
  }

  function move(key: string, dir: -1 | 1) {
    setDrafts((list) => {
      const i = list.findIndex((d) => d.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setDirty(true);
    const up = `${key}-move-up`;
    const down = `${key}-move-down`;
    // Keep focus on the same control; at the top or bottom it is disabled, so
    // fall back to the other direction.
    setFocusRequest(dir === -1 ? { id: up, fallback: down } : { id: down, fallback: up });
  }

  function confirmDelete() {
    const key = pendingDelete;
    setPendingDelete(null);
    if (!key) return;
    setDrafts((list) => list.filter((d) => d.key !== key));
    setErrors((e) => {
      if (!e.byKey[key]) return e;
      const byKey = { ...e.byKey };
      delete byKey[key];
      return { ...e, byKey };
    });
    setDirty(true);
    setFocusRequest({ id: "survey-editor-heading" });
  }

  const deleteIndex = pendingDelete ? drafts.findIndex((d) => d.key === pendingDelete) : -1;
  const deleteTarget = deleteIndex >= 0 ? drafts[deleteIndex] : null;

  return (
    <form
      action={formAction}
      onSubmit={() => setSubmittedKeys(drafts.map((d) => d.key))}
      className="space-y-4"
      noValidate
    >
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="questions" value={JSON.stringify(drafts.map(toPayload))} />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="survey-editor-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-balance text-[13px] font-semibold text-navy outline-none"
        >
          Survey questions
        </h2>
        <p className="text-[11px] text-text-muted tabular-nums">
          {drafts.length} of {SURVEY_MAX_QUESTIONS} questions
        </p>
      </div>

      {errorCount > 0 ? (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-[12px] text-red-700"
        >
          <p className="font-semibold">
            The survey could not be saved.
            {errorCount > errors.form.length
              ? " Fix the questions marked below, then save again."
              : null}
          </p>
          {errors.form.length > 0 ? (
            <ul className="mt-1.5 space-y-1">
              {errors.form.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* Locked while a save is in flight: the save adopts the server's list
          when it returns, so anything typed meanwhile would be discarded. The
          posted JSON is captured at submit, before this disables. */}
      <fieldset disabled={pending} aria-busy={pending} className="min-w-0 space-y-3 disabled:opacity-60">
        {copySources.length > 0 ? (
          <div className="rounded-lg border border-border bg-surface p-3">
            <FormLabel htmlFor="survey-copy-source">
              Copy questions from another event
            </FormLabel>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {/* No name: the choice is client state, never posted with the survey. */}
              <select
                id="survey-copy-source"
                value={copySource?.eventId ?? ""}
                onChange={(e) => {
                  setCopyFrom(e.target.value);
                  setCopyNotice(null);
                }}
                aria-invalid={copyNotice && !copyNotice.ok ? true : undefined}
                aria-describedby={copyNotice ? "survey-copy-notice" : undefined}
                className={cn(
                  inputBase,
                  "min-w-0 bg-white sm:flex-1",
                  copyNotice && !copyNotice.ok && inputInvalid,
                )}
              >
                {copySources.map((s) => (
                  <option key={s.eventId} value={s.eventId}>
                    {s.label} ({plural(s.questions.length, "question", "questions")})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={copyQuestions}
                aria-describedby={copyNotice ? "survey-copy-notice" : undefined}
                className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-md border border-border bg-white px-4 text-[12px] font-semibold text-navy hover:bg-surface"
              >
                Add questions
              </button>
            </div>
            {/* Always mounted so screen readers announce the result. */}
            <p
              id="survey-copy-notice"
              role="status"
              aria-live="polite"
              className={cn(
                "text-pretty text-[11px] tabular-nums empty:hidden",
                copyNotice?.ok ? "mt-1.5 text-text-mid" : "mt-1 text-red-600",
              )}
            >
              {copyNotice?.text}
            </p>
          </div>
        ) : null}

        {drafts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center">
            <p className="text-pretty text-[12px] text-text-muted">
              This event has no survey yet, so attendees go straight from the quiz to their certificate.
            </p>
            <button
              type="button"
              onClick={addQuestion}
              className="mt-3 inline-flex min-h-9 items-center rounded-md bg-navy px-4 text-[12px] font-semibold text-white hover:bg-navy/90"
            >
              Add first question
            </button>
          </div>
        ) : (
          <ol className="space-y-3">
            {drafts.map((d, i) => (
              <QuestionCard
                key={d.key}
                draft={d}
                index={i}
                total={drafts.length}
                errors={errors.byKey[d.key] ?? {}}
                onEdit={(field, change) => edit(d.key, field, change)}
                onMove={(dir) => move(d.key, dir)}
                onDelete={() => setPendingDelete(d.key)}
              />
            ))}
          </ol>
        )}
      </fieldset>

      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        {drafts.length > 0 ? (
          <button
            type="button"
            onClick={addQuestion}
            disabled={atMax || pending}
            className="inline-flex min-h-9 items-center justify-center rounded-md border border-border bg-white px-4 text-[12px] font-semibold text-navy hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            {atMax ? `Limit of ${SURVEY_MAX_QUESTIONS} questions reached` : "+ Add question"}
          </button>
        ) : (
          <span />
        )}
        <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center">
          <p role="status" aria-live="polite" className="text-[11px] text-text-muted">
            {pending
              ? "Saving..."
              : dirty
                ? "You have unsaved changes."
                : savedAt
                  ? `Survey saved at ${new Date(savedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.`
                  : null}
          </p>
          {drafts.length > 0 || dirty ? (
            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-9 items-center justify-center rounded-md bg-navy px-5 text-[13px] font-semibold text-white hover:bg-navy/90 disabled:cursor-wait disabled:opacity-70"
            >
              {pending ? "Saving..." : "Save survey"}
            </button>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete question ${deleteIndex + 1}?`}
        description={
          <>
            <p>
              {deleteTarget?.prompt.trim()
                ? `"${deleteTarget.prompt.trim()}" will be removed from the survey when you save.`
                : "This question will be removed from the survey when you save."}
            </p>
            {deleteTarget?.id ? (
              <p className="mt-2">Answers already collected stay in the responses download.</p>
            ) : null}
          </>
        }
        confirmLabel="Delete question"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </form>
  );
}

function QuestionCard({
  draft: d,
  index,
  total,
  errors,
  onEdit,
  onMove,
  onDelete,
}: {
  draft: Draft;
  index: number;
  total: number;
  errors: QuestionErrors;
  onEdit: (field: string | null, change: (d: Draft) => Draft) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const n = index + 1;
  const choice = isChoiceType(d.type);
  const promptId = `${d.key}-prompt`;
  const typeId = `${d.key}-type`;
  const requiredId = `${d.key}-required`;
  const typeChanged = d.id !== undefined && d.savedType !== undefined && d.savedType !== d.type;

  const errId = (field: string) => `${d.key}-${field.replace(/\./g, "-")}-error`;
  const describe = (field: string) => (errors[field]?.length ? errId(field) : undefined);
  const fieldError = (field: string) =>
    errors[field]?.length ? (
      <div id={errId(field)}>
        <FieldError messages={errors[field]} />
      </div>
    ) : null;

  const smallButton =
    "inline-flex min-h-8 min-w-8 items-center justify-center rounded-md border border-border bg-white px-2 text-[12px] font-semibold text-navy hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <li
      className={cn(
        "rounded-lg border bg-white p-4",
        Object.keys(errors).length > 0 ? "border-red-300" : "border-border",
      )}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <h3 className="text-[12px] font-semibold text-navy tabular-nums">Question {n}</h3>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            id={`${d.key}-move-up`}
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label={`Move question ${n} up`}
            className={smallButton}
          >
            <span aria-hidden>↑</span>
          </button>
          <button
            type="button"
            id={`${d.key}-move-down`}
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label={`Move question ${n} down`}
            className={smallButton}
          >
            <span aria-hidden>↓</span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete question ${n}`}
            className={cn(smallButton, "text-red-700")}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <FormLabel htmlFor={promptId} required>
            Question text
          </FormLabel>
          <FormTextarea
            id={promptId}
            value={d.prompt}
            maxLength={SURVEY_PROMPT_MAX}
            rows={2}
            onChange={(e) => {
              const prompt = e.target.value;
              onEdit("prompt", (x) => ({ ...x, prompt }));
            }}
            aria-invalid={errors.prompt?.length ? true : undefined}
            aria-describedby={describe("prompt")}
            className={cn("min-h-[64px]", errors.prompt?.length && inputInvalid)}
          />
          <p className="mt-1 text-right text-[10px] text-text-muted tabular-nums">
            {d.prompt.length} / {SURVEY_PROMPT_MAX}
          </p>
          {fieldError("prompt")}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
          <div>
            <FormLabel htmlFor={typeId}>Answer type</FormLabel>
            <select
              id={typeId}
              value={d.type}
              onChange={(e) => {
                const type = e.target.value as SurveyQuestionType;
                onEdit("type", (x) => ({
                  ...x,
                  type,
                  // Options survive a switch between the two choice types and a
                  // detour through a text type; a first switch to a choice type
                  // starts with the two blanks a choice question needs.
                  options:
                    isChoiceType(type) && x.options.length === 0 ? ["", ""] : x.options,
                }));
              }}
              aria-invalid={errors.type?.length ? true : undefined}
              aria-describedby={describe("type")}
              className={cn(inputBase, "bg-white", errors.type?.length && inputInvalid)}
            >
              {SURVEY_QUESTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SURVEY_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            {fieldError("type")}
            {typeChanged ? (
              <p className="mt-1 text-pretty text-[11px] text-text-muted">
                Changing the type saves this as a new question. Answers already collected stay in the
                download under the old question.
              </p>
            ) : null}
          </div>

          <div className="sm:pt-6">
            <label htmlFor={requiredId} className="flex items-start gap-2 text-[12px] text-navy">
              <input
                id={requiredId}
                type="checkbox"
                checked={d.required}
                onChange={(e) => {
                  const required = e.target.checked;
                  onEdit("required", (x) => ({ ...x, required }));
                }}
                className="mt-0.5 h-4 w-4 accent-navy"
              />
              <span>
                <span className="font-semibold">Required</span>
                <span className="block text-pretty text-[11px] text-text-muted">
                  Attendees must answer before they can continue.
                </span>
              </span>
            </label>
            {fieldError("required")}
          </div>
        </div>

        {choice ? (
          <OptionsEditor draft={d} n={n} errors={errors} onEdit={onEdit} />
        ) : null}
      </div>
    </li>
  );
}

function OptionsEditor({
  draft: d,
  n,
  errors,
  onEdit,
}: {
  draft: Draft;
  n: number;
  errors: QuestionErrors;
  onEdit: (field: string | null, change: (d: Draft) => Draft) => void;
}) {
  const atMin = d.options.length <= SURVEY_OPTIONS_MIN;
  const atMax = d.options.length >= SURVEY_OPTIONS_MAX;
  const listErrors = errors.options;

  return (
    <fieldset aria-describedby={listErrors?.length ? `${d.key}-options-error` : undefined}>
      <legend className="mb-1.5 text-[11px] font-semibold text-text-mid">
        Options
        <span className="ml-2 text-[10px] font-normal text-text-muted tabular-nums">
          {SURVEY_OPTIONS_MIN} to {SURVEY_OPTIONS_MAX}
        </span>
      </legend>
      <ul className="space-y-2">
        {d.options.map((opt, k) => {
          const field = `options.${k}`;
          const msgs = errors[field];
          const inputId = `${d.key}-option-${k}`;
          const errorId = `${d.key}-options-${k}-error`;
          return (
            <li key={k}>
              <div className="flex items-center gap-2">
                <span aria-hidden className="w-5 shrink-0 text-right text-[11px] text-text-muted tabular-nums">
                  {k + 1}.
                </span>
                <input
                  id={inputId}
                  type="text"
                  value={opt}
                  maxLength={SURVEY_OPTION_MAX}
                  aria-label={`Question ${n}, option ${k + 1}`}
                  aria-invalid={msgs?.length ? true : undefined}
                  aria-describedby={msgs?.length ? errorId : undefined}
                  onChange={(e) => {
                    const value = e.target.value;
                    onEdit(field, (x) => ({
                      ...x,
                      options: x.options.map((o, idx) => (idx === k ? value : o)),
                    }));
                  }}
                  className={cn(inputBase, msgs?.length && inputInvalid)}
                />
                <button
                  type="button"
                  onClick={() =>
                    onEdit("options", (x) => ({
                      ...x,
                      options: x.options.filter((_, idx) => idx !== k),
                    }))
                  }
                  disabled={atMin}
                  aria-label={`Remove option ${k + 1} from question ${n}`}
                  className="inline-flex min-h-8 min-w-8 shrink-0 items-center justify-center rounded-md border border-border bg-white text-[14px] text-text-mid hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span aria-hidden>×</span>
                </button>
              </div>
              {msgs?.length ? (
                <div id={errorId} className="pl-7">
                  <FieldError messages={msgs} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {listErrors?.length ? (
        <div id={`${d.key}-options-error`}>
          <FieldError messages={listErrors} />
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => onEdit("options", (x) => ({ ...x, options: [...x.options, ""] }))}
        disabled={atMax}
        className="mt-2 inline-flex min-h-8 items-center rounded-md border border-border bg-white px-3 text-[12px] font-semibold text-navy hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
      >
        {atMax ? `Limit of ${SURVEY_OPTIONS_MAX} options reached` : "+ Add option"}
      </button>
    </fieldset>
  );
}
