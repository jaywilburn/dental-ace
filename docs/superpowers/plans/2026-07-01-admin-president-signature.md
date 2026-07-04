# Admin-Controlled President Signature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AADB president the signatory of the approval-letter PDF, with a script-font (or uploaded-image) signature, all editable from a new `/admin/settings` page.

**Architecture:** A singleton `PlatformSettings` row holds the president name, title, and optional signature-image path. A server-only read helper (`getLetterSignatory`) feeds those into the existing pure PDFKit renderer, which is rewritten to sign as the president. The signature is always drawn as an image via `doc.image()`: either the uploaded PNG/JPG, or a script-font rendering of the name produced with `@napi-rs/canvas` (the repo's only proven font-embedding path — pdfkit here uses built-in fonts only). Admin server actions (mirroring `lib/admin/billing-overrides.ts`) edit the row with an audit-log entry. A preview route renders a sample letter.

**Tech Stack:** Next.js 16 (App Router, server components + server actions), Prisma + Supabase Postgres, Supabase Storage (`uploads` bucket, service-role), PDFKit + @napi-rs/canvas (both already externalized), Zod, Vitest.

## Global Constraints

- **Package manager: pnpm.** Never `npm install`. (`packageManager` pinned.)
- **TypeScript strict.** `pnpm typecheck` (`tsc --noEmit`) MUST be clean before every commit.
- **Zod validation** on every server action that accepts client input (name/title/image).
- **No em dashes (`—`)** in user-facing copy — the letter is user-facing; the validator rejects them.
- **No `middleware.ts`.** Route protection is per-handler / layout guards (`requireStaff("ADMIN")`).
- **App Router only.** No Pages Router.
- **Supabase Storage**, private `uploads` bucket, **service-role only, server-side.** Never expose the service-role key client-side.
- **PDF fonts:** pdfkit here uses ONLY built-in fonts (Helvetica/Times). Do NOT introduce `doc.registerFont` custom fonts (no serverless precedent). Custom typography goes through `@napi-rs/canvas` → PNG → `doc.image()`, mirroring `lib/badge/render.ts`.
- **RLS is the access-control floor** — the new table gets an ADMIN-only policy via `current_user_role()` (from `sql-migrations/0008`).
- **Commits:** work on a feature branch `feat/admin-president-signature` (created in Task 0). Do NOT push or merge to `main` — final integration is the user's call (project convention: deliveries land on a branch for review).

## File Structure

**Create:**
- `lib/pdf/fonts/signature-font.ts` — base64-embedded Great Vibes (OFL) script font.
- `lib/pdf/fonts/OFL.txt` — the font license.
- `lib/pdf/fonts/signature-font.test.ts` — asserts the font decodes to a valid sfnt.
- `lib/pdf/signature-image.ts` — `renderScriptSignaturePng(name)` (canvas → PNG).
- `lib/pdf/signature-image.test.ts` — asserts a PNG is produced and varies by name.
- `lib/admin/letter-settings-rules.ts` — pure Zod validators (`validateSignatory`, `validateSignatureImage`, `signatureExt`).
- `lib/admin/letter-settings-rules.test.ts` — validator unit tests.
- `lib/admin/letter-settings.ts` — `server-only` read helpers (`getLetterSettingsRow`, `getLetterSignatory`).
- `lib/admin/letter-settings-actions.ts` — `"use server"` mutations.
- `app/admin/settings/page.tsx` — the admin settings UI.
- `app/admin/settings/preview/route.ts` — sample-letter PDF preview.
- `sql-migrations/0015_platform_settings_rls.sql` — RLS floor (verify the next number).

**Modify:**
- `prisma/schema.prisma` — `PlatformSettings` model, `LETTER_SETTINGS_UPDATED` enum value, `User` back-relation.
- `lib/storage.ts` — add `downloadFromStorage`.
- `lib/pdf/approval-letter.ts` — new signatory inputs; remove `reviewerName`; image-based signature block.
- `lib/pdf/approval-letter.test.ts` — updated for the new signatory inputs.
- `lib/reviewer/accredit.ts` — `renderCourseAssets` loads the signatory; drop `reviewerName` from its input.
- `lib/reviewer/actions.ts` — drop the `reviewerName` argument to `renderCourseAssets`.
- `lib/reviewer/event-actions.ts` — drop `reviewerName`; load signatory for the event letter.
- `lib/courses/course-assets.ts` — regeneration passes the signatory.
- `lib/events/event-assets.ts` — regeneration passes the signatory.
- `lib/nav/portal-nav.ts` — add the "Settings" admin nav item.

---

### Task 0: Feature branch

- [ ] **Step 1: Create and switch to the branch**

Run:
```bash
cd /Users/jasonwilburn/Code/Dental/ACE
git checkout -b feat/admin-president-signature
```
Expected: `Switched to a new branch 'feat/admin-president-signature'`

---

### Task 1: Schema — `PlatformSettings`, audit enum, migration

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: Prisma model `PlatformSettings` with fields `id` (default `"singleton"`), `presidentName`, `presidentTitle`, `signatureImagePath?`, `signatureImageMime?`, `updatedAt`, `updatedById?`; enum value `AdminAuditAction.LETTER_SETTINGS_UPDATED`.

- [ ] **Step 1: Add the model**

Append this model to `prisma/schema.prisma` (anywhere at top level, e.g. after `AdminAuditLog`):

```prisma
model PlatformSettings {
  id                 String   @id @default("singleton")
  presidentName      String   @default("Dr. Clifford Feingold, DDS") @map("president_name")
  presidentTitle     String   @default("President, American Association of Dental Boards") @map("president_title")
  // Path in the private `uploads` bucket, e.g. "admin/president-signature.png".
  // Null => render the president name in the embedded script font instead.
  signatureImagePath String?  @map("signature_image_path")
  signatureImageMime String?  @map("signature_image_mime")
  updatedAt          DateTime @updatedAt @map("updated_at")
  updatedById        String?  @map("updated_by_id") @db.Uuid
  updatedBy          User?    @relation("PlatformSettingsUpdatedBy", fields: [updatedById], references: [id])

  @@map("platform_settings")
}
```

- [ ] **Step 2: Add the enum value**

In the `enum AdminAuditAction { ... }` block, add a line after `ACCESS_REQUEST_DENIED`:

```prisma
  LETTER_SETTINGS_UPDATED
```

- [ ] **Step 3: Add the User back-relation**

In `model User { ... }`, add this field alongside the other `@relation` back-relations (Prisma is order-independent within a model; place it near the `AdminActor`/`AdminTarget` relations):

```prisma
  platformSettingsUpdated PlatformSettings[] @relation("PlatformSettingsUpdatedBy")
```

- [ ] **Step 4: Validate the schema**

Run: `pnpm exec prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 5: Create + apply the migration**

Run: `pnpm exec prisma migrate dev --name platform_settings`
Expected: a new folder under `prisma/migrations/` and `Your database is now in sync with your schema.`

- [ ] **Step 6: Regenerate the client + typecheck**

Run: `pnpm exec prisma generate && pnpm typecheck`
Expected: client generated; `tsc --noEmit` exits 0 (no new errors).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add PlatformSettings singleton + LETTER_SETTINGS_UPDATED audit action"
```

---

### Task 2: Embed the script signature font

**Files:**
- Create: `lib/pdf/fonts/signature-font.ts`, `lib/pdf/fonts/OFL.txt`
- Test: `lib/pdf/fonts/signature-font.test.ts`

**Interfaces:**
- Produces: `export const SIGNATURE_FONT_BASE64: string` — a base64 TrueType font (Great Vibes Regular, SIL OFL 1.1).

- [ ] **Step 1: Write the failing test**

Create `lib/pdf/fonts/signature-font.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SIGNATURE_FONT_BASE64 } from "./signature-font";

describe("signature font", () => {
  it("decodes to a valid sfnt/TrueType font", () => {
    const buf = Buffer.from(SIGNATURE_FONT_BASE64, "base64");
    expect(buf.length).toBeGreaterThan(10000);
    // 0x00010000 (TrueType/glyf) or 0x4F54544F ("OTTO", CFF).
    expect([0x00010000, 0x4f54544f]).toContain(buf.readUInt32BE(0));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run lib/pdf/fonts/signature-font.test.ts`
Expected: FAIL — cannot resolve `./signature-font`.

- [ ] **Step 3: Download the font + license and generate the base64 module**

Run (from repo root):
```bash
mkdir -p lib/pdf/fonts
curl -fL -o /tmp/GreatVibes-Regular.ttf "https://raw.githubusercontent.com/google/fonts/main/ofl/greatvibes/GreatVibes-Regular.ttf"
curl -fL -o lib/pdf/fonts/OFL.txt "https://raw.githubusercontent.com/google/fonts/main/ofl/greatvibes/OFL.txt"
node -e 'const fs=require("fs");const b=fs.readFileSync("/tmp/GreatVibes-Regular.ttf").toString("base64");fs.writeFileSync("lib/pdf/fonts/signature-font.ts",`// Great Vibes (SIL OFL 1.1) — a static single-weight signature script, embedded\n// as base64 so the serverless bundle always ships it (no runtime fs asset read,\n// same pattern as lib/badge/geist-font.ts). Registered with @napi-rs/canvas in\n// lib/pdf/signature-image.ts. License: lib/pdf/fonts/OFL.txt\nexport const SIGNATURE_FONT_BASE64 =\n  ${JSON.stringify(b)};\n`);console.log("wrote",b.length,"base64 chars");'
```
Expected: prints `wrote <N> base64 chars` (N > 10000); `lib/pdf/fonts/signature-font.ts` and `OFL.txt` now exist.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run lib/pdf/fonts/signature-font.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pdf/fonts/signature-font.ts lib/pdf/fonts/OFL.txt lib/pdf/fonts/signature-font.test.ts
git commit -m "feat(pdf): embed Great Vibes signature script font (OFL)"
```

---

### Task 3: Script signature image module

**Files:**
- Create: `lib/pdf/signature-image.ts`
- Test: `lib/pdf/signature-image.test.ts`

**Interfaces:**
- Consumes: `SIGNATURE_FONT_BASE64` (`./fonts/signature-font`); `@napi-rs/canvas`.
- Produces: `renderScriptSignaturePng(name: string): Promise<Buffer>` — a transparent PNG of the name in the script font (navy ink), sized to the text.

- [ ] **Step 1: Write the failing test**

Create `lib/pdf/signature-image.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderScriptSignaturePng } from "./signature-image";

describe("renderScriptSignaturePng", () => {
  it("returns a PNG buffer", async () => {
    const png = await renderScriptSignaturePng("Dr. Clifford Feingold, DDS");
    expect(png.subarray(0, 8).toString("latin1")).toBe("\x89PNG\r\n\x1a\n");
    expect(png.length).toBeGreaterThan(100);
  });

  it("varies by name", async () => {
    const a = await renderScriptSignaturePng("Dr. A, DDS");
    const b = await renderScriptSignaturePng("Dr. B, DDS");
    expect(a.equals(b)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run lib/pdf/signature-image.test.ts`
Expected: FAIL — cannot resolve `./signature-image`.

- [ ] **Step 3: Write the implementation**

Create `lib/pdf/signature-image.ts`:

```ts
import "server-only";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { SIGNATURE_FONT_BASE64 } from "./fonts/signature-font";

/*
  Renders a president's name as a script "signature" PNG using @napi-rs/canvas
  (native, serverless-safe) with the embedded Great Vibes font. This mirrors the
  marketing-logo path (lib/badge/render.ts): draw text on a canvas, export a
  PNG, then let pdfkit place it with doc.image(). We deliberately avoid pdfkit
  custom fonts — the repo's only proven font-embedding path is the canvas one,
  and the serverless bundle already ships @napi-rs/canvas.

  Transparent background; navy ink. The letter scales this to fit, so the pixel
  size only sets resolution/aspect, not final placement.
*/

const NAVY = "#0B1A2E";
const FONT_PX = 72;

let fontRegistered = false;
function ensureFont(): void {
  if (fontRegistered) return;
  GlobalFonts.register(Buffer.from(SIGNATURE_FONT_BASE64, "base64"), "SignatureScript");
  fontRegistered = true;
}

export async function renderScriptSignaturePng(name: string): Promise<Buffer> {
  ensureFont();
  const text = name.trim() || " ";

  // Measure on a scratch context to size the canvas to the text.
  const scratch = createCanvas(10, 10).getContext("2d");
  scratch.font = `${FONT_PX}px SignatureScript`;
  const width = Math.max(1, Math.ceil(scratch.measureText(text).width) + 24);
  const height = FONT_PX + 48; // headroom for script ascenders/descenders

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.font = `${FONT_PX}px SignatureScript`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = NAVY;
  ctx.fillText(text, 12, height / 2);

  return await canvas.encode("png");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run lib/pdf/signature-image.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add lib/pdf/signature-image.ts lib/pdf/signature-image.test.ts
git commit -m "feat(pdf): render president name as a script signature PNG"
```

---

### Task 4: Pure validators — `letter-settings-rules.ts`

**Files:**
- Create: `lib/admin/letter-settings-rules.ts`
- Test: `lib/admin/letter-settings-rules.test.ts`

**Interfaces:**
- Produces:
  - `validateSignatory(presidentName: string, presidentTitle: string): { ok: true; value: { presidentName: string; presidentTitle: string } } | { ok: false; error: string }` (trims; rejects empty, over-long, em dash).
  - `validateSignatureImage(mime: string, size: number): { ok: true } | { ok: false; error: string }` (PNG/JPG only, 1..1_000_000 bytes).
  - `signatureExt(mime: string): "png" | "jpg"`.

- [ ] **Step 1: Write the failing test**

Create `lib/admin/letter-settings-rules.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  validateSignatory,
  validateSignatureImage,
  signatureExt,
} from "./letter-settings-rules";

describe("validateSignatory", () => {
  it("accepts and trims a valid name + title", () => {
    const r = validateSignatory("  Dr. Clifford Feingold, DDS  ", " President, American Association of Dental Boards ");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.presidentName).toBe("Dr. Clifford Feingold, DDS");
      expect(r.value.presidentTitle).toBe("President, American Association of Dental Boards");
    }
  });

  it("rejects an empty name", () => {
    expect(validateSignatory("   ", "President").ok).toBe(false);
  });

  it("rejects an over-long name", () => {
    expect(validateSignatory("x".repeat(121), "President").ok).toBe(false);
  });

  it("rejects an em dash", () => {
    expect(validateSignatory("Dr. A — B", "President").ok).toBe(false);
  });
});

describe("validateSignatureImage", () => {
  it("accepts a small PNG", () => {
    expect(validateSignatureImage("image/png", 5000).ok).toBe(true);
  });
  it("accepts a small JPEG", () => {
    expect(validateSignatureImage("image/jpeg", 5000).ok).toBe(true);
  });
  it("rejects a GIF", () => {
    expect(validateSignatureImage("image/gif", 5000).ok).toBe(false);
  });
  it("rejects an oversize file", () => {
    expect(validateSignatureImage("image/png", 2_000_000).ok).toBe(false);
  });
  it("rejects a zero-byte file", () => {
    expect(validateSignatureImage("image/png", 0).ok).toBe(false);
  });
});

describe("signatureExt", () => {
  it("maps mime to extension", () => {
    expect(signatureExt("image/png")).toBe("png");
    expect(signatureExt("image/jpeg")).toBe("jpg");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run lib/admin/letter-settings-rules.test.ts`
Expected: FAIL — cannot resolve `./letter-settings-rules`.

- [ ] **Step 3: Write the implementation**

Create `lib/admin/letter-settings-rules.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run lib/admin/letter-settings-rules.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/admin/letter-settings-rules.ts lib/admin/letter-settings-rules.test.ts
git commit -m "feat(admin): add letter-signatory validators"
```

---

### Task 5: Storage download helper + signatory read helper

**Files:**
- Modify: `lib/storage.ts`
- Create: `lib/admin/letter-settings.ts`

**Interfaces:**
- Consumes: `prisma` (`@/lib/prisma`); `PlatformSettings` model (Task 1); `BucketKind` (`@/lib/storage`).
- Produces:
  - `downloadFromStorage(args: { kind: BucketKind; path: string }): Promise<Buffer>` in `lib/storage.ts`.
  - `getLetterSettingsRow(): Promise<{ presidentName: string; presidentTitle: string; signatureImagePath: string | null; signatureImageMime: string | null }>`.
  - `getLetterSignatory(): Promise<{ presidentName: string; presidentTitle: string; signatureImage: Buffer | null }>`.

- [ ] **Step 1: Add `downloadFromStorage` to `lib/storage.ts`**

Append to `lib/storage.ts` (after `createSignedUrl`). Note the file already imports `createServiceRoleClient` and defines `bucketName`/`BucketKind`:

```ts
export async function downloadFromStorage(args: {
  kind: BucketKind;
  path: string;
}): Promise<Buffer> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage
    .from(bucketName(args.kind))
    .download(args.path);
  if (error || !data) {
    throw new Error(
      `Storage download failed (${args.path}): ${error?.message ?? "no data"}`,
    );
  }
  return Buffer.from(await data.arrayBuffer());
}
```

- [ ] **Step 2: Create the read helper**

Create `lib/admin/letter-settings.ts`:

```ts
import "server-only";
import { prisma } from "@/lib/prisma";
import { downloadFromStorage } from "@/lib/storage";

/*
  Read helpers for the platform letter-signatory settings (the president credit
  on the approval letter). The single PlatformSettings row (id "singleton") is
  lazily created with schema defaults on first read, so no seed/migration data
  step is required and existing environments render with the default president.

  Writes live in lib/admin/letter-settings-actions.ts ("use server").
*/

export type LetterSettingsRow = {
  presidentName: string;
  presidentTitle: string;
  signatureImagePath: string | null;
  signatureImageMime: string | null;
};

export type LetterSignatory = {
  presidentName: string;
  presidentTitle: string;
  signatureImage: Buffer | null;
};

/** Lazily upsert + return the singleton settings row. */
export async function getLetterSettingsRow(): Promise<LetterSettingsRow> {
  return prisma.platformSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
    select: {
      presidentName: true,
      presidentTitle: true,
      signatureImagePath: true,
      signatureImageMime: true,
    },
  });
}

/**
 * The signatory block for renderApprovalLetterPdf: president name + title, plus
 * the uploaded signature image bytes when one exists. A missing/failed image
 * download degrades to null (the renderer then draws a script-font signature)
 * and never throws — letter generation must not break on a storage hiccup.
 */
export async function getLetterSignatory(): Promise<LetterSignatory> {
  const row = await getLetterSettingsRow();
  let signatureImage: Buffer | null = null;
  if (row.signatureImagePath) {
    try {
      signatureImage = await downloadFromStorage({
        kind: "uploads",
        path: row.signatureImagePath,
      });
    } catch (err) {
      console.error("[letter-settings] signature image download failed", err);
      signatureImage = null;
    }
  }
  return {
    presidentName: row.presidentName,
    presidentTitle: row.presidentTitle,
    signatureImage,
  };
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add lib/storage.ts lib/admin/letter-settings.ts
git commit -m "feat(admin): add storage download + letter-signatory read helper"
```

---

### Task 6: Rewrite the approval-letter renderer

**Files:**
- Modify: `lib/pdf/approval-letter.ts`
- Test: `lib/pdf/approval-letter.test.ts`

**Interfaces:**
- Consumes: `renderScriptSignaturePng` (`./signature-image`, Task 3).
- Produces: `ApprovalLetterInput` gains `presidentName: string`, `presidentTitle: string`, `signatureImage?: Buffer | null`; **removes** `reviewerName`. `renderApprovalLetterPdf(input): Promise<Buffer>` unchanged signature shape.

- [ ] **Step 1: Update the test first**

Replace the entire contents of `lib/pdf/approval-letter.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { renderApprovalLetterPdf } from "@/lib/pdf/approval-letter";

const baseInput = {
  companyName: "Texas Dental Association",
  courseTitle:
    "Advanced Infection Control and Sterilization Protocols for the Modern Dental Practice",
  courseIdNumber: "ACE-2026-00042",
  ceHours: 2,
  approvedAt: new Date("2026-06-29T12:00:00Z"),
  expiresAt: new Date("2028-06-29T12:00:00Z"),
  presidentName: "Dr. Clifford Feingold, DDS",
  presidentTitle: "President, American Association of Dental Boards",
};

// Counts page objects (`/Type /Page`) without matching the page-tree node
// (`/Type /Pages`). PDFKit writes these dictionaries uncompressed, so the count
// is a reliable proxy for "the signature block and footer did not overflow onto
// a second page and clip."
function countPdfPages(buf: Buffer): number {
  return (buf.toString("latin1").match(/\/Type\s*\/Page(?![s])/g) ?? []).length;
}

describe("renderApprovalLetterPdf", () => {
  it("returns a non-empty, valid PDF buffer", async () => {
    const buf = await renderApprovalLetterPdf(baseInput);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("stays on a single page with the script-font signature", async () => {
    const buf = await renderApprovalLetterPdf(baseInput);
    expect(countPdfPages(buf)).toBe(1);
  });

  it("stays on a single page with an uploaded signature image", async () => {
    // Minimal valid 1x1 PNG.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
      "base64",
    );
    const buf = await renderApprovalLetterPdf({ ...baseInput, signatureImage: png });
    expect(countPdfPages(buf)).toBe(1);
  });

  it("reflects the president name in the output", async () => {
    const a = await renderApprovalLetterPdf(baseInput);
    const b = await renderApprovalLetterPdf({
      ...baseInput,
      presidentName: "Dr. Someone Else, DDS",
    });
    expect(a.equals(b)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run lib/pdf/approval-letter.test.ts`
Expected: FAIL — type error / the renderer still expects `reviewerName` and doesn't accept `presidentName`.

- [ ] **Step 3: Update the import + input type**

In `lib/pdf/approval-letter.ts`, add the import at the top (after the `seal` import):

```ts
import { renderScriptSignaturePng } from "./signature-image";
```

Replace the `ApprovalLetterInput` type (lines ~16-24) with:

```ts
export type ApprovalLetterInput = {
  companyName: string;
  courseTitle: string;
  courseIdNumber: string;
  ceHours: number;
  approvedAt: Date;
  expiresAt: Date;
  presidentName: string;
  presidentTitle: string;
  // Uploaded signature bytes; when absent, the president name is drawn in the
  // embedded script font as the signature.
  signatureImage?: Buffer | null;
};
```

- [ ] **Step 4: Remove the hard-coded president constant**

Delete the constant + its comment (lines ~26-28):

```ts
// The reviewer (rendered in the signature block) is the signatory. This is a
// standing program credit beneath that block. No em dash in the title line.
const AADB_PRESIDENT = "Dr. Clifford Feingold, DDS";
```

- [ ] **Step 5: Resolve the signature image before building the document**

Change the function opening so it resolves the signature image first. Replace:

```ts
export async function renderApprovalLetterPdf(
  input: ApprovalLetterInput,
): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
```

with:

```ts
export async function renderApprovalLetterPdf(
  input: ApprovalLetterInput,
): Promise<Buffer> {
  // The signature is always an image: the uploaded one, or a script-font
  // rendering of the president name (canvas -> PNG, no pdfkit custom fonts).
  const signatureImage =
    input.signatureImage ?? (await renderScriptSignaturePng(input.presidentName));
  return await new Promise<Buffer>((resolve, reject) => {
```

- [ ] **Step 6: Replace the signature + president-credit block**

Replace the whole block from `// Signature` through the president-credit `.text("President, American Association of Dental Boards", 56, 695);` (lines ~147-174) with:

```ts
      // Signatory block: the AADB president signs the letter. `signatureImage`
      // is either the uploaded signature or a script-font rendering of the
      // president name (resolved above). Fixed coordinates (same discipline as
      // the footer below) keep it clear of the seal and above the bottom-margin
      // line, so the letter stays a single page.
      const sigBlockTop = 596;
      doc
        .fillColor(NAVY)
        .font("Helvetica")
        .fontSize(11)
        .text("Sincerely,", 56, sigBlockTop);

      // Height is clamped so a tall image can never push content onto page 2.
      const sigGraphicTop = sigBlockTop + 20;
      doc.image(signatureImage, 56, sigGraphicTop, { fit: [230, 46] });

      // Typed name + title beneath the signature graphic.
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(NAVY)
        .text(input.presidentName, 56, sigGraphicTop + 52);
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(TEXT_MUTED)
        .text(input.presidentTitle, 56, sigGraphicTop + 67);

      // Accreditation seal, to the right of the signature block.
      drawAadbSeal(doc, { cx: doc.page.width - 110, cy: 640, r: 38 });
```

(Leave the footer block that follows — lines ~176-195 — unchanged.)

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm exec vitest run lib/pdf/approval-letter.test.ts`
Expected: PASS (all four cases). If the single-page test fails, lower `sigBlockTop` by 10-20 and re-run.

- [ ] **Step 8: Typecheck (call sites will still error — expected)**

Run: `pnpm typecheck`
Expected: errors ONLY in the 5 call sites that still pass `reviewerName` / omit `presidentName` (fixed in Task 7). No errors inside `approval-letter.ts` itself.

- [ ] **Step 9: Commit**

```bash
git add lib/pdf/approval-letter.ts lib/pdf/approval-letter.test.ts
git commit -m "feat(pdf): president is the approval-letter signatory (image signature)"
```

---

### Task 7: Wire the signatory into all 5 render call sites

**Files:**
- Modify: `lib/reviewer/accredit.ts`, `lib/reviewer/actions.ts`, `lib/reviewer/event-actions.ts`, `lib/courses/course-assets.ts`, `lib/events/event-assets.ts`

**Interfaces:**
- Consumes: `getLetterSignatory` (`@/lib/admin/letter-settings`); the new `ApprovalLetterInput` (Task 6).

- [ ] **Step 1: `accredit.ts` — load the signatory in `renderCourseAssets`, drop `reviewerName`**

In `lib/reviewer/accredit.ts`:

Add the import near the other imports:
```ts
import { getLetterSignatory } from "@/lib/admin/letter-settings";
```

Remove `reviewerName: string;` from the `RenderCourseAssetsInput` type (line ~142).

Inside `renderCourseAssets`, at the top of the `try` block (before `const attendeeUrl = ...`), add:
```ts
    const signatory = await getLetterSignatory();
```

Replace the `renderApprovalLetterPdf({ ... })` call (lines ~163-171) with:
```ts
    const letterJob = renderApprovalLetterPdf({
      companyName: input.companyName,
      courseTitle: input.courseTitle,
      courseIdNumber: input.courseIdNumber,
      ceHours: input.ceHours,
      approvedAt: input.approvedAt,
      expiresAt: input.expiresAt,
      ...signatory,
    }).then((pdf) => {
      letterPdf = pdf;
    });
```

- [ ] **Step 2: `actions.ts` — drop the `reviewerName` argument**

In `lib/reviewer/actions.ts`, in the `renderCourseAssets({ ... })` call, delete this line (line ~94):
```ts
    reviewerName: reviewer.email.split("@")[0],
```

- [ ] **Step 3: `event-actions.ts` — drop `reviewerName`, load signatory for the event letter**

In `lib/reviewer/event-actions.ts`:

Add the import near the other imports:
```ts
import { getLetterSignatory } from "@/lib/admin/letter-settings";
```

In the per-session `renderCourseAssets({ ... })` call, delete this line (line ~197):
```ts
      reviewerName: reviewer.email.split("@")[0],
```

For the event-level letter: add, immediately before the `try {` that wraps the `Promise.all` (line ~206):
```ts
  const signatory = await getLetterSignatory();
```
Then in the `renderApprovalLetterPdf({ ... })` call (lines ~209-217), replace the `reviewerName: reviewer.email.split("@")[0],` line with:
```ts
        ...signatory,
```

- [ ] **Step 4: `course-assets.ts` — pass the signatory on regeneration**

In `lib/courses/course-assets.ts`:

Add the import near the other imports:
```ts
import { getLetterSignatory } from "@/lib/admin/letter-settings";
```

Replace the approval-letter render callback (lines ~98-114) with:
```ts
    course.approvalLetterUrl
      ? signOrRegenerateAssetUrl(
          course.approvalLetterUrl,
          async () => ({
            body: await renderApprovalLetterPdf({
              companyName: course.companyName,
              courseTitle: course.courseTitle,
              courseIdNumber: course.courseIdNumber,
              ceHours: course.ceHours,
              approvedAt: course.approvedAt,
              expiresAt: course.expiresAt,
              ...(await getLetterSignatory()),
            }),
            contentType: "application/pdf",
          }),
          io,
        )
      : null,
```

- [ ] **Step 5: `event-assets.ts` — pass the signatory on regeneration**

In `lib/events/event-assets.ts`:

Add the import near the other imports:
```ts
import { getLetterSignatory } from "@/lib/admin/letter-settings";
```

Replace the approval-letter render callback (lines ~40-52) with:
```ts
    event.approvalLetterUrl
      ? signOrRegenerateAssetUrl(event.approvalLetterUrl, async () => ({
          body: await renderApprovalLetterPdf({
            companyName: event.companyName,
            courseTitle: event.eventName,
            courseIdNumber: event.eventIdNumber,
            ceHours: event.totalHours,
            approvedAt: event.approvedAt,
            expiresAt: event.expiresAt,
            ...(await getLetterSignatory()),
          }),
          contentType: "application/pdf",
        }))
      : null,
```

- [ ] **Step 6: Typecheck + run the PDF test**

Run: `pnpm typecheck && pnpm exec vitest run lib/pdf/approval-letter.test.ts`
Expected: `tsc --noEmit` exits 0; PDF tests PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/reviewer/accredit.ts lib/reviewer/actions.ts lib/reviewer/event-actions.ts lib/courses/course-assets.ts lib/events/event-assets.ts
git commit -m "feat: render approval letters with the configured president signatory"
```

---

### Task 8: Admin server actions — `letter-settings-actions.ts`

**Files:**
- Create: `lib/admin/letter-settings-actions.ts`

**Interfaces:**
- Consumes: `requireStaff` (`@/lib/auth/session`), `prisma`, `uploadToStorage` + `createServiceRoleClient`, `recordAdminAction` (`@/lib/admin/audit`), the Task 4 validators, `AdminAuditAction` (`@prisma/client`).
- Produces: server actions `updateLetterSignatory(formData: FormData)`, `uploadSignatureImage(formData: FormData)`, `removeSignatureImage()`.

- [ ] **Step 1: Create the actions file**

Create `lib/admin/letter-settings-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AdminAuditAction } from "@prisma/client";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { uploadToStorage } from "@/lib/storage";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { recordAdminAction } from "@/lib/admin/audit";
import {
  validateSignatory,
  validateSignatureImage,
  signatureExt,
} from "@/lib/admin/letter-settings-rules";

/*
  Admin writes for the platform letter-signatory settings (the president credit
  on the approval letter). Mirrors lib/admin/billing-overrides.ts: guard ->
  validate -> transaction (upsert the singleton + write an AdminAuditLog row in
  the SAME tx) -> revalidate -> redirect with ?ok / ?error. Singleton id
  "singleton". targetUserId is null (a platform-scoped change, not a user).
*/

const SETTINGS_PATH = "/admin/settings";
const UPLOADS_BUCKET = process.env.SUPABASE_STORAGE_BUCKET_UPLOADS ?? "uploads";

export async function updateLetterSignatory(formData: FormData) {
  const admin = await requireStaff("ADMIN");
  const v = validateSignatory(
    String(formData.get("presidentName") ?? ""),
    String(formData.get("presidentTitle") ?? ""),
  );
  if (!v.ok) redirect(`${SETTINGS_PATH}?error=${encodeURIComponent(v.error)}`);

  await prisma.$transaction(async (tx) => {
    await tx.platformSettings.upsert({
      where: { id: "singleton" },
      update: {
        presidentName: v.value.presidentName,
        presidentTitle: v.value.presidentTitle,
        updatedById: admin.id,
      },
      create: {
        id: "singleton",
        presidentName: v.value.presidentName,
        presidentTitle: v.value.presidentTitle,
        updatedById: admin.id,
      },
    });
    await recordAdminAction(tx, {
      actorUserId: admin.id,
      targetUserId: null,
      action: AdminAuditAction.LETTER_SETTINGS_UPDATED,
      summary: `Set approval-letter signatory to "${v.value.presidentName}"`,
      details: {
        presidentName: v.value.presidentName,
        presidentTitle: v.value.presidentTitle,
      },
    });
  });

  revalidatePath(SETTINGS_PATH);
  redirect(`${SETTINGS_PATH}?ok=signatory`);
}

export async function uploadSignatureImage(formData: FormData) {
  const admin = await requireStaff("ADMIN");
  const file = formData.get("signatureImage");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`${SETTINGS_PATH}?error=${encodeURIComponent("Choose a PNG or JPG file.")}`);
  }
  const f = file as File;
  const v = validateSignatureImage(f.type, f.size);
  if (!v.ok) redirect(`${SETTINGS_PATH}?error=${encodeURIComponent(v.error)}`);

  const path = `admin/president-signature.${signatureExt(f.type)}`;
  const body = Buffer.from(await f.arrayBuffer());
  await uploadToStorage({ kind: "uploads", path, body, contentType: f.type });

  await prisma.$transaction(async (tx) => {
    await tx.platformSettings.upsert({
      where: { id: "singleton" },
      update: { signatureImagePath: path, signatureImageMime: f.type, updatedById: admin.id },
      create: {
        id: "singleton",
        signatureImagePath: path,
        signatureImageMime: f.type,
        updatedById: admin.id,
      },
    });
    await recordAdminAction(tx, {
      actorUserId: admin.id,
      targetUserId: null,
      action: AdminAuditAction.LETTER_SETTINGS_UPDATED,
      summary: "Uploaded approval-letter signature image",
      details: { signatureImagePath: path, mime: f.type },
    });
  });

  revalidatePath(SETTINGS_PATH);
  redirect(`${SETTINGS_PATH}?ok=image`);
}

export async function removeSignatureImage() {
  const admin = await requireStaff("ADMIN");
  const current = await prisma.platformSettings.findUnique({
    where: { id: "singleton" },
    select: { signatureImagePath: true },
  });
  if (current?.signatureImagePath) {
    try {
      const supabase = createServiceRoleClient();
      await supabase.storage.from(UPLOADS_BUCKET).remove([current.signatureImagePath]);
    } catch (err) {
      console.error("[letter-settings] signature image delete failed", err);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.platformSettings.upsert({
      where: { id: "singleton" },
      update: { signatureImagePath: null, signatureImageMime: null, updatedById: admin.id },
      create: { id: "singleton", updatedById: admin.id },
    });
    await recordAdminAction(tx, {
      actorUserId: admin.id,
      targetUserId: null,
      action: AdminAuditAction.LETTER_SETTINGS_UPDATED,
      summary: "Removed approval-letter signature image (reverted to script font)",
      details: {},
    });
  });

  revalidatePath(SETTINGS_PATH);
  redirect(`${SETTINGS_PATH}?ok=image_removed`);
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add lib/admin/letter-settings-actions.ts
git commit -m "feat(admin): server actions to edit the letter signatory"
```

---

### Task 9: Admin settings page + nav item

**Files:**
- Modify: `lib/nav/portal-nav.ts`
- Create: `app/admin/settings/page.tsx`

**Interfaces:**
- Consumes: `PageHeader` (`@/components/portal-shell`), `requireStaff`, `getLetterSettingsRow`, `createSignedUrl`, the Task 8 actions.

- [ ] **Step 1: Add the nav item**

In `lib/nav/portal-nav.ts`, in the `admin` array's "Governance" section `items`, add after the Audit Log item:

```ts
        { label: "Settings", href: "/admin/settings", icon: "⚙️" },
```

- [ ] **Step 2: Create the page**

Create `app/admin/settings/page.tsx`:

```tsx
import { PageHeader } from "@/components/portal-shell";
import { requireStaff } from "@/lib/auth/session";
import { getLetterSettingsRow } from "@/lib/admin/letter-settings";
import { createSignedUrl } from "@/lib/storage";
import {
  updateLetterSignatory,
  uploadSignatureImage,
  removeSignatureImage,
} from "@/lib/admin/letter-settings-actions";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireStaff("ADMIN");
  const { ok, error } = await searchParams;
  const settings = await getLetterSettingsRow();

  let signatureUrl: string | null = null;
  if (settings.signatureImagePath) {
    try {
      signatureUrl = await createSignedUrl("uploads", settings.signatureImagePath, 300);
    } catch {
      signatureUrl = null;
    }
  }

  return (
    <>
      <PageHeader title="Platform Settings" subtitle="Approval-letter signatory" />
      {ok ? (
        <div className="mb-4 rounded-md border border-emerald-400 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-700">
          Settings saved.
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-md border border-red-400 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <form
          action={updateLetterSignatory}
          className="rounded-lg border border-border bg-white p-4 space-y-3"
        >
          <p className="text-[12px] font-semibold text-navy">
            President (approval-letter signatory)
          </p>
          <label className="block text-[11px] font-medium text-text-muted">
            Name
            <input
              type="text"
              name="presidentName"
              defaultValue={settings.presidentName}
              maxLength={120}
              required
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-[13px]"
            />
          </label>
          <label className="block text-[11px] font-medium text-text-muted">
            Title
            <input
              type="text"
              name="presidentTitle"
              defaultValue={settings.presidentTitle}
              maxLength={160}
              required
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-[13px]"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-navy px-3 py-1.5 text-[12px] font-semibold text-white"
          >
            Save signatory
          </button>
        </form>

        <div className="rounded-lg border border-border bg-white p-4 space-y-3">
          <p className="text-[12px] font-semibold text-navy">Signature image</p>
          {signatureUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signatureUrl}
                alt="Current signature"
                className="h-16 w-auto border border-border bg-surface p-1"
              />
              <form action={removeSignatureImage}>
                <button
                  type="submit"
                  className="rounded-md border border-border px-3 py-1.5 text-[12px] font-semibold text-text-mid"
                >
                  Remove image (use script-font signature)
                </button>
              </form>
            </>
          ) : (
            <p className="text-[11px] text-text-muted">
              No image uploaded. The president name renders in a script font as the signature.
            </p>
          )}
          <form action={uploadSignatureImage} className="space-y-2">
            <input
              type="file"
              name="signatureImage"
              accept="image/png,image/jpeg"
              required
              className="block w-full text-[12px]"
            />
            <p className="text-[11px] text-text-muted">
              PNG or JPG, under 1 MB. Replaces the script-font signature.
            </p>
            <button
              type="submit"
              className="rounded-md bg-navy px-3 py-1.5 text-[12px] font-semibold text-white"
            >
              Upload signature
            </button>
          </form>
        </div>
      </div>

      <div className="mt-5">
        <a
          href="/admin/settings/preview"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-md border border-navy px-3 py-1.5 text-[12px] font-semibold text-navy"
        >
          Preview sample letter (PDF)
        </a>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add lib/nav/portal-nav.ts app/admin/settings/page.tsx
git commit -m "feat(admin): /admin/settings page for the letter signatory"
```

---

### Task 10: Sample-letter preview route

**Files:**
- Create: `app/admin/settings/preview/route.ts`

**Interfaces:**
- Consumes: `requireStaff`, `getLetterSignatory`, `renderApprovalLetterPdf`.

- [ ] **Step 1: Create the route**

Create `app/admin/settings/preview/route.ts`:

```ts
import { requireStaff } from "@/lib/auth/session";
import { getLetterSignatory } from "@/lib/admin/letter-settings";
import { renderApprovalLetterPdf } from "@/lib/pdf/approval-letter";

/*
  Admin-only sample approval-letter preview. Renders the letter with the CURRENT
  signatory settings + placeholder course data so an admin can eyeball the
  signature before it reaches a real applicant. GET, inline PDF, never cached.
*/
export async function GET() {
  await requireStaff("ADMIN");
  const signatory = await getLetterSignatory();
  const approvedAt = new Date();
  const expiresAt = new Date(approvedAt);
  expiresAt.setFullYear(expiresAt.getFullYear() + 3);

  const pdf = await renderApprovalLetterPdf({
    companyName: "Sample Dental Association",
    courseTitle: "Sample Continuing Education Course",
    courseIdNumber: "ACE-PREVIEW-0000",
    ceHours: 2,
    approvedAt,
    expiresAt,
    ...signatory,
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="approval-letter-preview.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add app/admin/settings/preview/route.ts
git commit -m "feat(admin): sample approval-letter preview route"
```

---

### Task 11: RLS floor for `platform_settings`

**Files:**
- Create: `sql-migrations/0015_platform_settings_rls.sql` (confirm the next number)

- [ ] **Step 1: Confirm the next migration number**

Run: `ls sql-migrations/`
Expected: highest existing is `0014_*`. If not, use `<highest+1>` in the filename below.

- [ ] **Step 2: Write the migration**

Create `sql-migrations/0015_platform_settings_rls.sql`:

```sql
-- Platform settings singleton (approval-letter signatory). Admin-only floor.
-- current_user_role() (sql-migrations/0008) derives ADMIN/REVIEWER/CUSTOMER
-- from staff_role + company presence. App reads during letter rendering go
-- through Prisma (table owner, bypasses RLS), so rendering is unaffected; this
-- policy is the access-control floor for the anon/authenticated (supabase-js)
-- roles, which must never read or write platform settings.

alter table public.platform_settings enable row level security;

drop policy if exists platform_settings_admin_all on public.platform_settings;
create policy platform_settings_admin_all
  on public.platform_settings
  for all
  to authenticated
  using (public.current_user_role() = 'ADMIN')
  with check (public.current_user_role() = 'ADMIN');
```

- [ ] **Step 3: Apply via the Supabase MCP**

Apply this file's SQL using the Supabase MCP `apply_migration` tool (name: `platform_settings_rls`).

- [ ] **Step 4: Verify RLS is enabled**

Using the Supabase MCP `execute_sql` tool, run:
```sql
select relrowsecurity from pg_class where relname = 'platform_settings';
```
Expected: one row, `true`.

- [ ] **Step 5: Commit**

```bash
git add sql-migrations/0015_platform_settings_rls.sql
git commit -m "feat(db): RLS admin-only floor on platform_settings"
```

---

### Task 12: Full verification + manual end-to-end

- [ ] **Step 1: Typecheck**

Run: `pnpm typecheck`
Expected: exits 0.

- [ ] **Step 2: Full test suite**

Run: `pnpm exec vitest run`
Expected: all tests pass (font, signature-image, validator, and PDF tests included).

- [ ] **Step 3: Production build**

Run: `pnpm build`
Expected: build completes with no errors.

- [ ] **Step 4: Manual e2e (use the superpowers:verify skill or drive it in the browser)**

Run `pnpm dev`, then as admin `jay@wilburncreative.com` (dev password from `CLAUDE.md`):
  1. Visit `/admin/settings` — the "Settings" nav item appears under Governance; name defaults to "Dr. Clifford Feingold, DDS", title to "President, American Association of Dental Boards".
  2. Open **Preview sample letter** — the PDF is signed by the president; the name appears in the script font; NO reviewer username appears.
  3. Change the name to e.g. "Dr. Jane Roe, DDS", save → success banner; re-open preview → the new name signs the letter.
  4. Enter a name containing an em dash → error banner, no change.
  5. Upload a signature PNG → success; the current image shows on the page; preview now uses the image instead of the script font.
  6. **Remove image** → reverts to the script-font name in the preview.
  7. As a reviewer, approve a PENDING test application; open the generated approval letter from `/company/courses` (or the emailed attachment in dev logs) → confirms the president signs it and the reviewer name is gone.
  8. Check `/admin/audit` → a `LETTER_SETTINGS_UPDATED` row exists for each change.

- [ ] **Step 5: Report the outcome**

Summarize what was verified (with the actual command output for typecheck/test/build). Do NOT merge to `main` — leave the branch for the user to review and integrate.

---

## Self-Review

**Spec coverage:**
- President is sole signatory → Task 6 (renderer) + Task 7 (call sites drop `reviewerName`). ✓
- Script-font default, image override → Task 2 (font) + Task 3 (script PNG) + Task 6 (`signatureImage ?? script`). ✓
- Admin-editable name/title/image → Task 8 (actions) + Task 9 (page). ✓
- `PlatformSettings` singleton, lazy default → Task 1 (model) + Task 5 (`getLetterSettingsRow` upsert). ✓
- Audit-log entry → Task 8 (`recordAdminAction`, `LETTER_SETTINGS_UPDATED` from Task 1). ✓
- RLS floor → Task 11. ✓
- Preview button → Task 9 (link) + Task 10 (route). ✓
- 5 call sites load signatory, renderer stays pure of DB → Task 7. ✓
- Single-page invariant preserved + tested → Task 6 (test cases). ✓
- No pdfkit custom fonts (serverless-safe) → Task 3 (canvas PNG) consumed by Task 6. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command has an expected result. ✓

**Type consistency:** `getLetterSignatory(): { presidentName, presidentTitle, signatureImage }` (Task 5) is spread into `ApprovalLetterInput { ...; presidentName; presidentTitle; signatureImage? }` (Task 6) — field names match. `renderScriptSignaturePng(name): Promise<Buffer>` (Task 3) is called with `input.presidentName` (Task 6). Validators' `{ok,value}|{ok,error}` shape (Task 4) matches the action call sites (Task 8). `AdminAuditAction.LETTER_SETTINGS_UPDATED` (Task 1) used in Task 8. `downloadFromStorage`/`uploadToStorage` `{kind,path,...}` signatures consistent across Tasks 5 and 8. ✓
