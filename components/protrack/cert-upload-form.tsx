"use client";

import { useActionState, useRef, useState } from "react";
import { uploadCertificate } from "@/lib/protrack/cert-actions";
import {
  type CertActionState,
  CATEGORY_OPTIONS,
  ACCREDITATION_OPTIONS,
  DELIVERY_OPTIONS,
} from "@/lib/protrack/cert-options";
import { cn } from "@/lib/utils";

const fieldClass =
  "w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] text-navy outline-none focus:border-ace";
const labelClass = "mb-1 block text-[11px] font-semibold text-text-mid";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-[11px] text-red-600">{message}</p>;
}

export function CertUploadForm({
  categoryOptions = CATEGORY_OPTIONS,
}: {
  /** Category names from the user's state requirement; falls back to the generic list. */
  categoryOptions?: readonly string[];
}) {
  const [state, formAction, isPending] = useActionState<CertActionState, FormData>(
    uploadCertificate,
    {},
  );
  const errors = state.fieldErrors ?? {};

  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files;
    if (dropped.length && inputRef.current) {
      inputRef.current.files = dropped;
      setFileName(dropped[0]?.name ?? null);
    }
  }

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
          {state.error}
        </p>
      ) : null}

      {/* Drop zone */}
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed bg-white px-4 py-8 text-center transition-colors",
          dragOver ? "border-ace bg-ace-bg" : "border-border hover:border-ace",
        )}
      >
        <span aria-hidden className="text-2xl">
          ⬆️
        </span>
        <span className="text-[13px] font-semibold text-navy">
          {fileName ?? "Drag a certificate here, or click to browse"}
        </span>
        <span className="text-[11px] text-text-muted">
          PDF, JPG, or PNG · max 10MB · optional
        </span>
        <input
          ref={inputRef}
          type="file"
          name="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="sr-only"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
      </label>

      <div>
        <label htmlFor="courseTitle" className={labelClass}>
          Course name
        </label>
        <input id="courseTitle" name="courseTitle" className={fieldClass} required />
        <FieldError message={errors.courseTitle} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="provider" className={labelClass}>
            Provider / Organization
          </label>
          <input id="provider" name="provider" className={fieldClass} required />
          <FieldError message={errors.provider} />
        </div>
        <div>
          <label htmlFor="accreditationType" className={labelClass}>
            Accreditation type
          </label>
          <select
            id="accreditationType"
            name="accreditationType"
            className={fieldClass}
            defaultValue=""
            required
          >
            <option value="" disabled>
              Select one
            </option>
            {ACCREDITATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <FieldError message={errors.accreditationType} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="category" className={labelClass}>
            CE category
          </label>
          <select
            id="category"
            name="category"
            className={fieldClass}
            defaultValue=""
            required
          >
            <option value="" disabled>
              Select one
            </option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <FieldError message={errors.category} />
        </div>
        <div>
          <label htmlFor="deliveryFormat" className={labelClass}>
            Delivery format
          </label>
          <select
            id="deliveryFormat"
            name="deliveryFormat"
            className={fieldClass}
            defaultValue=""
            required
          >
            <option value="" disabled>
              Select one
            </option>
            {DELIVERY_OPTIONS.map((o) => (
              // Key by label: several formats share the same enum bucket.
              <option key={o.label} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <FieldError message={errors.deliveryFormat} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="hours" className={labelClass}>
            CE hours
          </label>
          <input
            id="hours"
            name="hours"
            type="number"
            step="0.5"
            min="0.5"
            inputMode="decimal"
            className={cn(fieldClass, "tabular-nums")}
            required
          />
          <FieldError message={errors.hours} />
        </div>
        <div>
          <label htmlFor="completedAt" className={labelClass}>
            Completion date
          </label>
          <input
            id="completedAt"
            name="completedAt"
            type="date"
            className={fieldClass}
            required
          />
          <FieldError message={errors.completedAt} />
        </div>
        <div>
          <label htmlFor="certNumber" className={labelClass}>
            Certificate number{" "}
            <span className="font-normal text-text-muted">(optional)</span>
          </label>
          <input id="certNumber" name="certNumber" className={fieldClass} />
          <FieldError message={errors.certNumber} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-navy px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-navy/90 disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save Certificate"}
        </button>
        <a
          href="/protrack/certificates"
          className="rounded-md border border-border bg-white px-4 py-2 text-[12px] font-semibold text-navy transition-colors hover:bg-surface"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
