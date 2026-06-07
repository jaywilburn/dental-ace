"use client";

import { useRef, useState } from "react";
import {
  FIELD_RULES,
  validateUpload,
  type AttachmentField,
} from "@/lib/forms/application/upload-schema";

/*
  Client uploader for a single application attachment. Posts the file straight
  to /api/uploads/draft-attachment, which persists the fileRef into the draft's
  applicationData. Because the upload is saved server-side immediately, the
  surrounding step form needs no hidden field — it just advances on Next.
*/

type Status = "idle" | "uploading" | "done" | "error";

export function FileUploadField({
  applicationId,
  field,
  label,
  required,
  existingFilename,
}: {
  applicationId: string;
  field: AttachmentField;
  label: string;
  required?: boolean;
  existingFilename?: string;
}) {
  const rule = FIELD_RULES[field];
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>(existingFilename ? "done" : "idle");
  const [filename, setFilename] = useState<string | undefined>(existingFilename);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const clientError = validateUpload(field, { type: file.type, size: file.size });
    if (clientError) {
      setStatus("error");
      setError(clientError);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setStatus("uploading");
    setError(null);

    const body = new FormData();
    body.set("applicationId", applicationId);
    body.set("field", field);
    body.set("file", file);

    try {
      const res = await fetch("/api/uploads/draft-attachment", { method: "POST", body });
      const json = (await res.json()) as
        | { ok: true; fileRef: { filename: string } }
        | { ok: false; error: string };
      if (!res.ok || !json.ok) {
        const msg = "error" in json ? json.error : "Upload failed.";
        setStatus("error");
        setError(msg);
        return;
      }
      setStatus("done");
      setFilename(json.fileRef.filename);
    } catch {
      setStatus("error");
      setError("Upload failed. Check your connection and try again.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold text-text-mid">
        {label}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
        <span className="ml-2 text-[10px] font-normal text-text-muted">{rule.allowed}</span>
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={status === "uploading"}
          className="rounded-md border border-border bg-white px-3 py-1.5 text-[12px] font-semibold text-navy transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "uploading"
            ? "Uploading…"
            : filename
              ? "Replace file"
              : "Choose file"}
        </button>
        {status === "done" && filename ? (
          <span className="truncate text-[12px] text-emerald-700">✓ {filename}</span>
        ) : status === "uploading" ? (
          <span className="text-[12px] text-text-muted">Uploading…</span>
        ) : (
          <span className="text-[12px] text-text-muted">No file selected</span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={rule.accept}
        onChange={handleChange}
        className="hidden"
      />

      {error ? (
        <p className="mt-1.5 text-[11px] text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
