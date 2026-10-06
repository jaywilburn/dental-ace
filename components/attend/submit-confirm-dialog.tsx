"use client";

import { useEffect, useRef } from "react";
import type { SubmitConfirmCopy } from "@/lib/attend/submit-confirm";

/*
  Modal confirmation in front of the attendee Submit button. A native <dialog>
  opened with showModal(), so focus is trapped and Escape closes it without a
  dependency. Escape and "Not yet" both call onCancel; nothing is submitted
  until the attendee presses the confirm button.
*/
export function SubmitConfirmDialog({
  copy,
  open,
  onCancel,
  onConfirm,
}: {
  copy: SubmitConfirmCopy;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // showModal focuses the first button (confirm). Start on the safe one so
      // a double press of Enter on Submit cannot confirm by accident.
      cancelRef.current?.focus();
    }
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="submit-confirm-title"
      // Escape fires "cancel"; keep React state as the single source of truth.
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-lg border border-slate-200 bg-white p-5 text-left backdrop:bg-slate-900/50"
    >
      <h2 id="submit-confirm-title" className="text-base font-semibold text-slate-900">
        {copy.title}
      </h2>
      {copy.body.map((line) => (
        <p key={line} className="mt-2 text-sm text-slate-700">
          {line}
        </p>
      ))}
      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          {copy.confirmLabel}
        </button>
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          className="w-full rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700"
        >
          {copy.cancelLabel}
        </button>
      </div>
    </dialog>
  );
}
