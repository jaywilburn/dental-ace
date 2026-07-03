# Approval Letter: Admin-Controlled President Signature

**Date:** 2026-07-01
**Status:** Approved (design)
**Author:** Jay Wilburn + Claude

## Problem

The Letter of Accreditation PDF sent to companies on course/event approval has no
real signature and no cleanly presented president's name. Today:

- The **signatory** is the *reviewer* — printed as the raw local-part of the
  reviewer's email (e.g. `jsmith`), which looks unpolished.
- The president is a hard-coded module constant
  (`AADB_PRESIDENT = "Dr. Clifford Feingold, DDS"` in `lib/pdf/approval-letter.ts:28`),
  rendered only as a small credit line beneath the reviewer block.
- Changing the president means a code change + redeploy.

AADB wants the president to be the letter's signatory with an actual signature,
and wants the president's name/title/signature editable from the admin dashboard
so it updates on all future letters without a code change.

## Goals

1. President is the **sole signatory** of the approval letter. The reviewer's
   name is removed from the letter entirely.
2. A **signature** appears above the president's name: a script-font rendering of
   the name by default, replaced by an uploaded signature image when one exists.
3. Admins edit the **president name**, **title line**, and **signature image**
   from a new `/admin/settings` page. Changes take effect on all subsequently
   generated letters (approval, regeneration, events).
4. Default president name: `Dr. Clifford Feingold, DDS`.
   Default title: `President, American Association of Dental Boards`.

## Non-Goals

- No change to the AADB seal (stays the vector ring; its existing
  `AADB_SEAL_ASSET_PATH` env hook is untouched).
- No change to the approved-course *email* body (`emails/application-approved.tsx`);
  it only references the PDF attachment.
- No general-purpose key-value settings framework. A single typed row, scoped to
  what this feature needs. (Future settings can extend the same row or table.)
- No retroactive re-rendering of already-issued letters as a batch job. Letters
  regenerate with current settings whenever a signed URL is refreshed
  (`course-assets.ts` / `event-assets.ts`), which is the existing behavior.

## Design

### Component boundaries

| Unit | Responsibility | Depends on |
|------|----------------|------------|
| `PlatformSettings` model (Prisma) | Persist the singleton signatory config | Postgres |
| `lib/admin/letter-settings.ts` | `getLetterSignatory()` read helper (with defaults) + `updateLetterSignatory` / `uploadSignatureImage` / `removeSignatureImage` server actions | Prisma, service-role storage client, `requireStaff`, `recordAdminAction` |
| `lib/pdf/approval-letter.ts` | Pure PDF renderer; gains signatory params, no DB access | pdfkit, embedded script font |
| `app/admin/settings/page.tsx` | Admin UI (RSC) to read + edit settings | `letter-settings.ts`, `requireStaff` |
| `app/admin/settings/preview/route.ts` | GET → sample letter PDF with current settings | `letter-settings.ts`, `approval-letter.ts` |
| RLS migration | ADMIN-only floor on the new table | Supabase |

### 1. Data model — `PlatformSettings` (singleton)

New Prisma model, one row enforced by a fixed primary key.

```prisma
model PlatformSettings {
  id                 String   @id @default("singleton")   // always "singleton"
  presidentName      String   @default("Dr. Clifford Feingold, DDS") @map("president_name")
  presidentTitle     String   @default("President, American Association of Dental Boards") @map("president_title")
  // Path in the private `uploads` bucket, e.g. "admin/president-signature.png". Null => render script-font name.
  signatureImagePath String?  @map("signature_image_path")
  signatureImageMime String?  @map("signature_image_mime")
  updatedAt          DateTime @updatedAt @map("updated_at")
  updatedById        String?  @map("updated_by_id") @db.Uuid
  updatedBy          User?    @relation("PlatformSettingsUpdatedBy", fields: [updatedById], references: [id])

  @@map("platform_settings")
}
```

- Singleton discipline: all reads/writes target `id = "singleton"` via
  `upsert`. `getLetterSignatory()` creates the row with defaults on first read,
  so **no data-migration seed is required** and existing environments work
  immediately.
- `User` gets the back-relation `platformSettingsUpdated PlatformSettings[] @relation("PlatformSettingsUpdatedBy")`.

### 2. Read helper — `getLetterSignatory()`

In `lib/admin/letter-settings.ts` (`server-only`):

```ts
type Signatory = {
  presidentName: string;
  presidentTitle: string;
  signatureImage: Buffer | null;   // downloaded bytes, or null => script font
};

async function getLetterSignatory(): Promise<Signatory>
```

- `upsert` the singleton row (create with schema defaults if absent), returning
  name + title.
- If `signatureImagePath` is set, download the bytes from the `uploads` bucket
  via the **service-role** storage client and return them as a Buffer. On any
  download failure, log and fall back to `signatureImage: null` (script font) —
  a missing image must never break letter generation.

### 3. PDF renderer changes — `lib/pdf/approval-letter.ts`

- Extend `ApprovalLetterInput`:
  - **Remove** `reviewerName` from what gets rendered (keep the field optional
    for now to avoid breaking callers, but it is no longer drawn — see call-site
    cleanup below).
  - **Add** `presidentName: string`, `presidentTitle: string`,
    `signatureImage?: Buffer | null`.
- Delete the `AADB_PRESIDENT` constant.
- Rewrite the signature block (currently lines ~147-174) into one consolidated
  block, positioned with the same fixed-coordinate discipline that keeps the
  letter single-page:
  1. `Sincerely,`
  2. **Signature graphic:**
     - If `signatureImage` present → `doc.image(buffer, x, y, { fit: [220, 46] })`
       (constrained height so it can't push the footer off-page).
     - Else → president name in the embedded **script font** at ~26pt.
  3. President name (Helvetica-Bold, navy) — the typed name.
  4. President title (Helvetica, muted).
  - Seal stays to the right (`drawAadbSeal` at its current position).
- **Script font:** bundle an OFL-licensed script/handwriting font (e.g. *Dancing
  Script*) and register it with `doc.registerFont(...)`, following the
  base64-embed pattern established by the Marketing Logo rewrite (Geist). Font
  file lives under `lib/pdf/fonts/`. No network/CDN at render time.
- **Single-page invariant preserved.** Net vertical content is *less* than today
  (the reviewer's two lines are gone; the president lines move up into the
  signature area), so it fits. The signature-image height is clamped.

### 4. Call-site cleanup (5 renderers)

Each caller loads the signatory and passes it in; the renderer stays pure and
DB-free.

- `lib/reviewer/accredit.ts:163`
- `lib/reviewer/actions.ts` (approve action; stop deriving `reviewerName` from
  the email local-part — that value is no longer drawn)
- `lib/reviewer/event-actions.ts:209`
- `lib/courses/course-assets.ts:102`
- `lib/events/event-assets.ts:42`

Pattern at each site:

```ts
const signatory = await getLetterSignatory();
await renderApprovalLetterPdf({ ...input, ...signatory });
```

### 5. Admin UI — `/admin/settings`

- `app/admin/settings/page.tsx`: RSC, `await requireStaff("ADMIN")` at top
  (matches every other admin page). Reads current settings.
- Two progressive-enhancement forms (no client JS required), mirroring
  `app/admin/companies/[id]/page.tsx`:
  - **Signatory form** → `updateLetterSignatory(formData)`: name + title text
    inputs.
  - **Signature image form** → `uploadSignatureImage(formData)`: file input
    (PNG/JPG). Plus a **Remove image** button → `removeSignatureImage()` reverts
    to script font.
- Shows the current signature image (via short-lived signed download URL) or a
  "using script-font signature" note.
- A **Preview letter** link opens `/admin/settings/preview` in a new tab.
- Nav: add `{ label: "Settings", href: "/admin/settings", icon: "⚙️" }` to the
  **Governance** section in `lib/nav/portal-nav.ts`.

### 6. Server actions — `lib/admin/letter-settings.ts`

Follow the `billing-overrides.ts` recipe exactly: guard → Zod-validate →
transaction (upsert singleton) → `recordAdminAction` in the **same** transaction
→ `revalidatePath("/admin/settings")` → `redirect(?ok=... | ?error=...)`.

- `updateLetterSignatory`: Zod — name 1..120 chars, title 1..160 chars, both
  trimmed, non-empty. No em dashes (brand rule) — reject or strip.
- `uploadSignatureImage`: validate mime ∈ {`image/png`, `image/jpeg`}, size
  ≤ 1 MB. Upload to `uploads` bucket at fixed key `admin/president-signature.<ext>`
  with `upsert: true` via **service-role** client (server-side only — the
  service-role key is never sent to the client, per architecture rules). Persist
  `signatureImagePath` + `signatureImageMime`.
- `removeSignatureImage`: delete the storage object (best-effort) and null out
  the path/mime columns.
- New `AdminAuditAction` enum value **`LETTER_SETTINGS_UPDATED`**; audit row
  written with `targetUserId: null` and a human summary + `details` JSON of what
  changed (name/title/image). `recordAdminAction` already accepts a null target.

### 7. Preview route — `app/admin/settings/preview/route.ts`

- GET handler, `await requireStaff("ADMIN")`.
- Loads `getLetterSignatory()`, renders `renderApprovalLetterPdf` with **sample**
  course data (placeholder company/course/ID/hours/dates) so the admin can eyeball
  the signature.
- Returns the Buffer as `application/pdf` with `Content-Disposition: inline`.

### 8. RLS migration — `sql-migrations/`

New numbered file enabling RLS on `platform_settings`:

- SELECT/INSERT/UPDATE restricted to `current_user_role() = 'ADMIN'` (the helper
  from `sql-migrations/0008`).
- This is the access-control **floor**; app reads during letter rendering go
  through Prisma (direct DB connection, bypasses RLS), so rendering is unaffected.

## Data Flow

```
Admin edits name/title/image        Course/Event approved
   |  (/admin/settings form)            |  (reviewer action)
   v                                    v
letter-settings server action     getLetterSignatory()  --reads--> platform_settings row
   |  guard+validate                    |                           (+ downloads image bytes
   |  upsert singleton row              |                            from `uploads` bucket)
   |  recordAdminAction (same tx)       v
   v                             renderApprovalLetterPdf({...input, ...signatory})
platform_settings updated              |
                                       v
                                  PDF Buffer -> uploaded to `certificates`/`uploads`,
                                                attached to approval email
```

## Error Handling

- **Missing/failed signature image download** → fall back to script-font name;
  never throw from `getLetterSignatory()`.
- **No settings row yet** → `upsert` creates it with defaults; callers always get
  a valid signatory.
- **Invalid admin input** → server action redirects back with `?error=` (no
  partial write; validation precedes the transaction).
- **Storage upload failure** → server action redirects with `?error=`, DB
  unchanged.
- **Single-page overflow** → guarded by the existing/extended test.

## Testing

- `lib/pdf/approval-letter.test.ts` (extend): still single page; renders with (a)
  no image (script font) and (b) a small image Buffer; president name/title appear;
  reviewer name does **not** appear.
- `lib/admin/letter-settings.test.ts` (new): `getLetterSignatory()` returns
  defaults when no row; Zod validation rejects empty/over-long/em-dash inputs;
  image mime/size validation.
- `pnpm typecheck` clean; `pnpm build` clean before delivery.

## Migration & Rollout

1. Prisma migration: add `PlatformSettings` model + `LETTER_SETTINGS_UPDATED`
   enum value + `User` back-relation. (`pnpm exec prisma migrate dev`)
2. RLS migration applied via Supabase MCP `apply_migration`.
3. No seed needed (lazy upsert). Optionally `pnpm seed` ensures the row exists.
4. Backward compatible: until an admin sets anything, letters render with the
   default president name in script font — same name as today, now as the
   signatory.

## Open Questions

None. (Reviewer removal confirmed; preview button included.)
