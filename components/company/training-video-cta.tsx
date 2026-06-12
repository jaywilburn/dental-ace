"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/*
  Dashboard CTA that opens a training-video modal. Uses the native <dialog>
  element via showModal(), so the browser provides focus-trapping, ESC-to-close,
  and a top-layer backdrop (no z-index needed, no hand-rolled focus logic).

  The YouTube iframe is only mounted while the dialog is open, so it costs
  nothing on page load and the video stops playing the moment the modal closes.
*/

const VIDEO_ID = "YvYhQBV3gzI";

export function TrainingVideoCta({ className }: { className?: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  function openModal() {
    setOpen(true);
    dialogRef.current?.showModal();
  }

  function closeModal() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={cn(
          "inline-flex items-center gap-2 rounded-md border border-ace bg-ace-bg px-3.5 py-2 text-[12px] font-semibold text-ace-dark transition-colors hover:bg-ace-light hover:text-navy",
          className,
        )}
      >
        <PlayIcon />
        Watch the training video
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          // Backdrop click: the dialog element itself is the click target only
          // when the click lands outside the content panel.
          if (e.target === dialogRef.current) closeModal();
        }}
        className="m-auto w-[min(92vw,860px)] max-h-[90dvh] overflow-hidden rounded-xl border border-border bg-white p-0 shadow-lg backdrop:bg-navy/60"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[2px] text-text-muted">
              Training
            </p>
            <h2 className="truncate font-serif text-base font-bold text-navy sm:text-lg">
              Getting started with DentalACE
            </h2>
          </div>
          <button
            type="button"
            onClick={closeModal}
            aria-label="Close training video"
            className="grid size-8 shrink-0 place-items-center rounded-md text-text-muted transition-colors hover:bg-surface hover:text-navy"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="bg-navy">
          {open ? (
            <iframe
              className="aspect-video w-full"
              src={`https://www.youtube-nocookie.com/embed/${VIDEO_ID}?autoplay=1`}
              title="DentalACE training video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          ) : null}
        </div>
      </dialog>
    </>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-3.5" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="size-4"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
