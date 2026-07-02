"use client";

import { useRef, useState } from "react";
import { deleteAccount } from "@/lib/admin/users";

/*
  Hard-delete confirmation. Mirrors ConfirmSuspendUser (native <dialog> via
  showModal for focus-trap + ESC + top-layer backdrop). Because deletion is
  irreversible and frees the email for re-signup, the submit stays disabled
  until the admin types the exact account email. The guard in evaluateDeletable
  already ensures only clean accounts reach this dialog; the typing is friction,
  not a second guard. Copy is em-dash-free per brand rules.
*/
export function ConfirmDeleteUser({ userId, email }: { userId: string; email: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmText, setConfirmText] = useState("");
  const armed = confirmText.trim().toLowerCase() === email.toLowerCase();

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="rounded-md border border-red bg-red-bg px-3 py-1.5 text-[12px] font-semibold text-red transition-colors hover:bg-red hover:text-white"
      >
        Delete account
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setConfirmText("")}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[min(92vw,480px)] rounded-xl border border-border bg-white p-0 shadow-lg backdrop:bg-navy/60"
      >
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-balance font-serif text-lg font-bold text-navy">
            Delete this account permanently?
          </h2>
        </div>
        <div className="space-y-3 px-5 py-4">
          <p className="text-pretty text-[13px] leading-relaxed text-text-mid">
            <span className="font-semibold text-navy">{email}</span> and its
            profile, licenses, and CE records will be permanently removed, and
            the login will be deleted so the same email can sign up again. This
            cannot be undone.
          </p>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-mid">
              Type the account email to confirm
            </label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={email}
              autoComplete="off"
              className="w-full rounded-md border border-border px-3 py-2 text-[13px]"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-md border border-border px-3 py-1.5 text-[12px] font-semibold text-text-mid hover:bg-surface"
          >
            Cancel
          </button>
          <form action={deleteAccount}>
            <input type="hidden" name="userId" value={userId} />
            <button
              type="submit"
              disabled={!armed}
              className="rounded-md bg-red px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-red/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Delete permanently
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
