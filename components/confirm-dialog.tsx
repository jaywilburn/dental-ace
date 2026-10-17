"use client";

import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

/*
  Shared confirmation dialog for the portals (deleting a survey question, and
  any future "are you sure" step). Same native <dialog> pattern as the attendee
  submit confirm (components/attend/submit-confirm-dialog.tsx), which stays its
  own component because the public attendee form must not change underneath it:

  - showModal() traps focus and makes the rest of the page inert, with no
    dependency. Escape fires "cancel", which is routed to onCancel so React
    state stays the single source of truth.
  - role="alertdialog": it interrupts to confirm a consequential action.
  - Focus starts on Cancel, so a stray Enter cannot confirm.
  - Browsers without modal <dialog> (iOS Safari before 15.4) have no
    showModal(); there the content is shown in the page flow instead. `hidden`
    keeps it out of sight until wanted, because such a browser renders an
    unknown <dialog> as ordinary visible content.
*/
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Red confirm button for actions that remove something. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const titleId = `${id}-title`;
  const bodyId = `${id}-body`;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const modal = typeof el.showModal === "function";
    if (open) {
      if (!modal) el.setAttribute("open", "");
      else if (!el.open) el.showModal();
      cancelRef.current?.focus();
    } else if (!modal) {
      el.removeAttribute("open");
    } else if (el.open) {
      el.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      hidden={!open}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-lg border border-border bg-white p-5 text-left backdrop:bg-navy/50"
    >
      <h2 id={titleId} className="text-balance text-[15px] font-semibold text-navy">
        {title}
      </h2>
      <div id={bodyId} className="mt-2 text-pretty text-[13px] text-text-mid">
        {description}
      </div>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          className="min-h-9 rounded-md border border-border bg-white px-4 text-[12px] font-semibold text-navy hover:bg-surface"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={cn(
            "min-h-9 rounded-md px-4 text-[12px] font-semibold text-white",
            destructive ? "bg-red-600 hover:bg-red-700" : "bg-navy hover:bg-navy/90",
          )}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
