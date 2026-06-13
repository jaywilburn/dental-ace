"use client";

import { useRef } from "react";
import { suspendAccount } from "@/lib/admin/users";

/*
  Suspend confirmation. Uses the native <dialog> via showModal() (focus-trap,
  ESC, top-layer backdrop — no z-index, no hand-rolled focus). Suspension is the
  terminal lifecycle state (we never hard-delete), so the dialog reminds the
  admin to reassign any pending work first and echoes the ownership summary.

  suspendAccount is a server action imported straight into this client component
  and used as the <form action>.
*/

export function ConfirmSuspendUser({
  userId,
  email,
  ownershipSummary,
}: {
  userId: string;
  email: string;
  ownershipSummary: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="rounded-md border border-red bg-red-bg px-3 py-1.5 text-[12px] font-semibold text-red transition-colors hover:bg-red hover:text-white"
      >
        Suspend account
      </button>

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[min(92vw,480px)] rounded-xl border border-border bg-white p-0 shadow-lg backdrop:bg-navy/60"
      >
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-balance font-serif text-lg font-bold text-navy">
            Suspend this account?
          </h2>
        </div>
        <div className="space-y-3 px-5 py-4">
          <p className="text-pretty text-[13px] leading-relaxed text-text-mid">
            <span className="font-semibold text-navy">{email}</span> will be
            blocked from signing in immediately and bounced from any active
            session. This is reversible, you can reinstate them at any time.
          </p>
          {ownershipSummary ? (
            <div className="rounded-md border border-orange/40 bg-orange-bg px-3 py-2 text-[12px] text-orange">
              <span className="font-semibold">Reassign pending work first:</span>{" "}
              {ownershipSummary}
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-md border border-border px-3 py-1.5 text-[12px] font-semibold text-text-mid hover:bg-surface"
          >
            Cancel
          </button>
          <form action={suspendAccount}>
            <input type="hidden" name="userId" value={userId} />
            <button
              type="submit"
              className="rounded-md bg-red px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-red/90"
            >
              Suspend
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
