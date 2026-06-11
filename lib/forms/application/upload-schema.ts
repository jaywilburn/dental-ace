import { z } from "zod";

/*
  Validation + path rules for course-application file uploads (course outline,
  presenter CV/resume, presenter headshot). Shared by the upload route handler
  and the uploadDraftAttachment server action (defense in depth: the route is
  the first gate, the action re-validates). Pure module — no server-only deps —
  so the rules can be imported client-side for the picker's accept attribute
  and the path builder can be unit-tested.
*/

// "detailedBio" was briefly an upload field (June 2026) before becoming the
// Step 2 rich-text editor; it is no longer uploadable, but applications that
// captured one still render it via resolveAttachmentLinks.
export const ATTACHMENT_FIELDS = ["courseOutline", "cvResume", "headshot"] as const;
export type AttachmentField = (typeof ATTACHMENT_FIELDS)[number];

const PDF = "application/pdf";
const DOC = "application/msword";
const DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PNG = "image/png";
const JPEG = "image/jpeg";

const MB = 1024 * 1024;

type FieldRule = {
  label: string;
  /** Allowed MIME types. */
  mimes: readonly string[];
  /** Max file size in bytes. */
  maxBytes: number;
  /** `accept` attribute for the file picker. */
  accept: string;
  /** Human-readable allow-list for error copy. */
  allowed: string;
};

export const FIELD_RULES: Record<AttachmentField, FieldRule> = {
  courseOutline: {
    label: "Course outline",
    mimes: [PDF, DOC, DOCX, PNG, JPEG],
    maxBytes: 10 * MB,
    accept: ".pdf,.doc,.docx,.png,.jpg,.jpeg",
    allowed: "PDF, Word, or image, up to 10 MB",
  },
  cvResume: {
    label: "CV / resume",
    mimes: [PDF, DOC, DOCX, PNG, JPEG],
    maxBytes: 10 * MB,
    accept: ".pdf,.doc,.docx,.png,.jpg,.jpeg",
    allowed: "PDF, Word, or image, up to 10 MB",
  },
  headshot: {
    label: "Presenter headshot",
    mimes: [PNG, JPEG],
    maxBytes: 5 * MB,
    accept: ".png,.jpg,.jpeg",
    allowed: "PNG or JPEG, up to 5 MB",
  },
};

export const uploadMetaSchema = z.object({
  applicationId: z.string().min(1),
  field: z.enum(ATTACHMENT_FIELDS),
});

/**
 * Validate a file's MIME type + size against the rules for its field.
 * Returns an error message string, or null when the file is acceptable.
 */
export function validateUpload(
  field: AttachmentField,
  file: { type: string; size: number },
): string | null {
  const rule = FIELD_RULES[field];
  if (file.size <= 0) return "File is empty.";
  if (file.size > rule.maxBytes) {
    return `File is too large. ${rule.label} must be ${rule.allowed}.`;
  }
  if (!rule.mimes.includes(file.type)) {
    return `Unsupported file type. ${rule.label} must be ${rule.allowed}.`;
  }
  return null;
}

/** Strip any path components and unsafe characters from an uploaded filename. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  return cleaned.slice(0, 128) || "file";
}

/** Build the storage path for an attachment: applications/{id}/{field}/{ts}-{name}. */
export function buildAttachmentPath(
  applicationId: string,
  field: AttachmentField,
  filename: string,
  ts: number,
): string {
  return `applications/${applicationId}/${field}/${ts}-${sanitizeFilename(filename)}`;
}
