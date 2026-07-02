import { z } from "zod";

/*
  Pure validation for the platform letter-signatory settings. No DB, no
  server-only — unit-tested directly, mirroring lib/admin/override-rules.ts.
  Zod satisfies the "validate every server-action boundary" rule; the
  {ok,value}|{ok,error} shape matches override-rules for consistent call sites.
  Brand rule: no em dashes (the approval letter is user-facing copy).
*/

const EM_DASH = "—";
const noEmDash = (s: string) => !s.includes(EM_DASH);

const signatorySchema = z.object({
  presidentName: z
    .string()
    .trim()
    .min(1, "President name is required.")
    .max(120, "President name must be 120 characters or fewer.")
    .refine(noEmDash, "Remove the em dash (use a comma or parentheses)."),
  presidentTitle: z
    .string()
    .trim()
    .min(1, "Title is required.")
    .max(160, "Title must be 160 characters or fewer.")
    .refine(noEmDash, "Remove the em dash (use a comma or parentheses)."),
});

export type SignatoryValidation =
  | { ok: true; value: { presidentName: string; presidentTitle: string } }
  | { ok: false; error: string };

export function validateSignatory(
  presidentName: string,
  presidentTitle: string,
): SignatoryValidation {
  const parsed = signatorySchema.safeParse({ presidentName, presidentTitle });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  return { ok: true, value: parsed.data };
}

export type ImageValidation = { ok: true } | { ok: false; error: string };

const MAX_IMAGE_BYTES = 1_000_000; // 1 MB

export function validateSignatureImage(
  mime: string,
  size: number,
): ImageValidation {
  if (mime !== "image/png" && mime !== "image/jpeg") {
    return { ok: false, error: "Signature image must be a PNG or JPG." };
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Signature image must be under 1 MB." };
  }
  return { ok: true };
}

export function signatureExt(mime: string): "png" | "jpg" {
  return mime === "image/png" ? "png" : "jpg";
}
