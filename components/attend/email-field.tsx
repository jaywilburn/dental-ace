"use client";

import { useId, useState } from "react";
import { suggestEmailFix } from "@/lib/attend/email-typo";
import { FieldError } from "@/components/attend/form-errors";

/*
  Email input for the public attendee forms (course + event). On blur it checks
  the address for a likely typo ("gmail.con", "gmial.com") and offers a one-tap
  fix. The server independently rejects non-existent TLDs (attendeeEmailSchema);
  when that error comes back, the same fix button shows under it.
*/
export function EmailField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string[];
}) {
  const hintId = useId();
  // Suggestion captured on blur; cleared as soon as the attendee edits.
  const [blurHint, setBlurHint] = useState<string | null>(null);
  const suggestion = blurHint ?? (error ? suggestEmailFix(value) : null);

  return (
    <div className="text-sm">
      <label className="block">
        <span className="text-slate-700">Email</span>
        <input
          type="email"
          autoComplete="email"
          value={value}
          onChange={(e) => {
            setBlurHint(null);
            onChange(e.target.value);
          }}
          onBlur={() => setBlurHint(suggestEmailFix(value))}
          aria-invalid={error ? true : undefined}
          aria-describedby={hintId}
          className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${error ? "border-red-400" : "border-slate-300"}`}
        />
      </label>
      <FieldError messages={error} />
      <div id={hintId} aria-live="polite">
        {suggestion && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-ace-light bg-ace-bg px-3 py-2 text-xs text-slate-700">
            {/* The server error already reads "Did you mean ...?"; avoid saying it twice. */}
            {!error && (
              <span className="break-all">
                Did you mean <span className="font-medium text-slate-900">{suggestion}</span>?
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setBlurHint(null);
                onChange(suggestion);
              }}
              className="break-all py-1 text-left font-medium text-ace-dark underline underline-offset-2 hover:no-underline"
            >
              {error ? `Use ${suggestion}` : "Use this address"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
