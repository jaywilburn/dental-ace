# Application Form Field Expansion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the new client-specified application fields (organization & contact, course short description + most-used format, expanded creator and presenter fields) and switch Course Format to the 5 granular options, as a new 6-step wizard.

**Architecture:** All new fields are stored in the existing `course_applications.application_data` JSON column (no DB migration). New fields are required on the Zod write/submit path and optional on the tolerant read path so legacy applications stay viewable. A new "Organization & Contact" step becomes the wizard entry; the current Course Info page moves to `/new/course`. Reviewer detail and the review/submit summary render the new fields.

**Tech Stack:** Next.js 16 App Router (server components + server actions), Zod, Prisma, Tailwind, Vitest.

**Design doc:** `docs/superpowers/specs/2026-06-11-application-form-fields-design.md`

---

## Reference: full new-field inventory

- **Org step (new):** `organizationName`, `organizationAddress`, `adminName`, `adminEmail`, `adminPhone`
- **Course Info additions:** `shortDescription`, `primaryDistributionFormat`; relabel Category option to "Scientific (Clinical)"; format enum → 5 options
- **Creator additions:** `creatorEmail`, `creatorPhone`, `creatorAddress`, `highestDegree`, `educationPart1` (required), `educationPart2/3` (optional), `educationPart4` (default "N/A"), `creatorExperience`
- **Presenter additions (per presenter):** `experience`, `training`, `bio`

Wizard step numbers after this change: 1 Org · 2 Course · 3 Creator · 4 Presenters · 5 Quiz · 6 Review.

---

## Task 1: Schema changes + tests

**Files:**
- Modify: `lib/forms/application/schemas.ts`
- Create: `lib/forms/application/schemas.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/forms/application/schemas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  DELIVERY_FORMATS,
  HIGHEST_DEGREES,
  isLiveFormat,
  orgStepSchema,
  step1Schema,
  step2Schema,
  presenterSchema,
  applicationDataReadSchema,
} from "@/lib/forms/application/schemas";

describe("delivery formats", () => {
  it("uses the 5 granular options", () => {
    expect(DELIVERY_FORMATS).toEqual([
      "Live/In Person",
      "Live/Online",
      "On Demand Video",
      "On Demand Audio",
      "Printed Course",
    ]);
  });

  it("treats new and legacy live values as live", () => {
    expect(isLiveFormat("Live/In Person")).toBe(true);
    expect(isLiveFormat("Live/Online")).toBe(true);
    expect(isLiveFormat("Live/Virtual")).toBe(true); // legacy
    expect(isLiveFormat("Live Event")).toBe(true); // legacy
    expect(isLiveFormat("On Demand Video")).toBe(false);
    expect(isLiveFormat("Printed Course")).toBe(false);
  });
});

describe("orgStepSchema", () => {
  it("accepts a valid org/contact slice", () => {
    expect(
      orgStepSchema.safeParse({
        organizationName: "Texas Dental Association",
        organizationAddress: "100 Main St, Austin, TX 78701",
        adminName: "Jane Roe",
        adminEmail: "jane@example.com",
        adminPhone: "512-555-0100",
      }).success,
    ).toBe(true);
  });

  it("rejects a bad admin email", () => {
    const r = orgStepSchema.safeParse({
      organizationName: "Org",
      organizationAddress: "100 Main St, Austin, TX 78701",
      adminName: "Jane Roe",
      adminEmail: "not-an-email",
      adminPhone: "512-555-0100",
    });
    expect(r.success).toBe(false);
  });
});

describe("step1Schema additions", () => {
  it("requires shortDescription and primaryDistributionFormat", () => {
    const base = {
      courseTitle: "Infection Control",
      ceCreditHours: 1.5,
      subjectMatter: "Scientific",
      deliveryFormat: "Live/Online",
      publicProtectionStatement: "x".repeat(20),
      courseObjectives: "x".repeat(20),
      targetAudience: "General Dentists",
    };
    expect(step1Schema.safeParse(base).success).toBe(false);
    expect(
      step1Schema.safeParse({
        ...base,
        shortDescription: "y".repeat(20),
        primaryDistributionFormat: "Live/Online",
      }).success,
    ).toBe(true);
  });
});

describe("step2Schema additions", () => {
  const base = {
    creatorName: "Dr. Smith",
    credentials: "DDS",
    currentPosition: "Professor",
    detailedBioHtml: "<p>bio text here</p>",
    creatorEmail: "smith@example.com",
    creatorPhone: "512-555-0101",
    creatorAddress: "200 Oak St, Dallas, TX 75201",
    highestDegree: "Doctoral",
    educationPart1: "DDS, Baylor, 2005",
    creatorExperience: "Ten years of clinical research.",
  };

  it("accepts when only Part 1 of education is provided", () => {
    expect(step2Schema.safeParse(base).success).toBe(true);
  });

  it("defaults educationPart4 to N/A", () => {
    const parsed = step2Schema.parse(base);
    expect(parsed.educationPart4).toBe("N/A");
  });

  it("rejects an invalid highest degree", () => {
    expect(
      step2Schema.safeParse({ ...base, highestDegree: "PhD" }).success,
    ).toBe(false);
  });
});

describe("presenterSchema additions", () => {
  it("requires experience, training, and bio", () => {
    const r = presenterSchema.safeParse({
      name: "Dr. Smith",
      role: "Primary Presenter",
      commercialDisclosure: "None",
    });
    expect(r.success).toBe(false);
    expect(
      presenterSchema.safeParse({
        name: "Dr. Smith",
        role: "Primary Presenter",
        commercialDisclosure: "None",
        experience: "15 years lecturing",
        training: "Live train-the-trainer, 8 hours",
        bio: "Board-certified periodontist.",
      }).success,
    ).toBe(true);
  });
});

describe("applicationDataReadSchema tolerance", () => {
  it("parses a legacy application missing all new fields", () => {
    const legacy = {
      courseTitle: "Old Course",
      ceCreditHours: 2,
      subjectMatter: "Scientific",
      deliveryFormat: "Live Event",
      targetAudience: "General Dentists",
      publicProtectionStatement: "x".repeat(20),
      courseObjectives: "x".repeat(20),
      creatorName: "Dr. Old",
      credentials: "DDS",
      currentPosition: "Retired",
      detailedBioHtml: "<p>bio</p>",
      presenters: [
        { name: "Dr. Old", role: "Primary Presenter", commercialDisclosure: "None" },
      ],
      quiz: [],
    };
    expect(applicationDataReadSchema.safeParse(legacy).success).toBe(true);
  });

  it("exposes HIGHEST_DEGREES options", () => {
    expect(HIGHEST_DEGREES).toContain("None of the Above");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test schemas.test`
Expected: FAIL (e.g. `orgStepSchema` / `HIGHEST_DEGREES` / `primaryDistributionFormat` not exported; `DELIVERY_FORMATS` mismatch).

- [ ] **Step 3: Update `DELIVERY_FORMATS`, `LIVE_FORMATS`, `isLiveFormat`**

In `lib/forms/application/schemas.ts`, replace the `DELIVERY_FORMATS` / `LIVE_FORMATS` / `isLiveFormat` block (lines ~13-34) with:

```ts
export const DELIVERY_FORMATS = [
  "Live/In Person",
  "Live/Online",
  "On Demand Video",
  "On Demand Audio",
  "Printed Course",
] as const;

/*
  Formats that count as a live event for the combined-certificate questions
  and Event Setup eligibility. "Live/Virtual" and "Live Event" are retired
  values from applications saved before the 2026-06 format changes; existing
  data is never migrated, so the predicate must keep accepting them.
*/
export const LIVE_FORMATS = ["Live/In Person", "Live/Online"] as const;

export function isLiveFormat(format: string | undefined | null): boolean {
  if (!format) return false;
  return (
    (LIVE_FORMATS as readonly string[]).includes(format) ||
    format === "Live Event" ||
    format === "Live/Virtual"
  );
}
```

- [ ] **Step 4: Add the `HIGHEST_DEGREES` constant**

After the `TARGET_AUDIENCES` block, add:

```ts
export const HIGHEST_DEGREES = [
  "Associates",
  "Bachelors",
  "Masters",
  "Doctoral",
  "None of the Above",
] as const;
```

- [ ] **Step 5: Add `orgStepSchema` and extend `step1Schema` / `step2Schema` / `presenterSchema`**

Add `orgStepSchema` (place it just above `step1Schema`):

```ts
export const orgStepSchema = z.object({
  organizationName: z.string().min(2, "Organization name is required").max(200),
  organizationAddress: z
    .string()
    .min(5, "Full address (City, State, Zip) is required")
    .max(400),
  adminName: z.string().min(2, "Process administrator name is required").max(200),
  adminEmail: z.string().email("Enter a valid email"),
  adminPhone: z.string().min(7, "Enter a valid phone number").max(40),
});
```

Add to `step1Schema` object (alongside the existing keys):

```ts
  shortDescription: z
    .string()
    .min(20, "Add a short description (up to 2 paragraphs)")
    .max(1500),
  primaryDistributionFormat: z.enum(DELIVERY_FORMATS),
```

Add to `step2Schema` object:

```ts
  creatorEmail: z.string().email("Enter a valid email"),
  creatorPhone: z.string().min(7, "Enter a valid phone number").max(40),
  creatorAddress: z.string().min(5, "Address (City, State, Zip) is required").max(400),
  highestDegree: z.enum(HIGHEST_DEGREES),
  educationPart1: z
    .string()
    .min(2, "List universities/colleges, degrees, and graduation dates")
    .max(1000),
  educationPart2: z.string().max(1000).optional(),
  educationPart3: z.string().max(1000).optional(),
  educationPart4: z.string().max(1000).default("N/A"),
  creatorExperience: z
    .string()
    .min(10, "Describe experience relative to the course subject")
    .max(2000),
```

Add to `presenterSchema` object (alongside name/role/commercialDisclosure):

```ts
  experience: z.string().min(2, "Experience is required").max(1000),
  training: z.string().min(2, "Training received is required").max(1000),
  bio: z.string().min(2, "Bio is required").max(2000),
```

- [ ] **Step 6: Merge `orgStepSchema` into `applicationDataSchema`**

Change the `applicationDataSchema` definition:

```ts
export const applicationDataSchema = orgStepSchema
  .merge(step1Schema)
  .merge(step2Schema)
  .merge(step3Schema)
  .merge(step4Schema);
```

- [ ] **Step 7: Make new fields optional on the read path**

In the `applicationDataReadSchema.extend({ ... })` block, add these keys so legacy applications (which lack them) still parse:

```ts
    // New 2026-06 fields — optional on read so applications created before this
    // change remain viewable/approvable in the reviewer detail view.
    organizationName: z.string().optional(),
    organizationAddress: z.string().optional(),
    adminName: z.string().optional(),
    adminEmail: z.string().optional(),
    adminPhone: z.string().optional(),
    shortDescription: z.string().optional(),
    primaryDistributionFormat: z.string().optional(),
    creatorEmail: z.string().optional(),
    creatorPhone: z.string().optional(),
    creatorAddress: z.string().optional(),
    highestDegree: z.string().optional(),
    educationPart1: z.string().optional(),
    educationPart2: z.string().optional(),
    educationPart3: z.string().optional(),
    educationPart4: z.string().optional(),
    creatorExperience: z.string().optional(),
```

Note: `presenters` already comes from `applicationDataSchema` where each presenter now requires experience/training/bio. To keep legacy presenter arrays (which lack those) readable, also override `presenters` in the extend with a tolerant shape:

```ts
    presenters: z
      .array(
        z.object({
          name: z.string(),
          role: z.string(),
          commercialDisclosure: z.string().optional(),
          experience: z.string().optional(),
          training: z.string().optional(),
          bio: z.string().optional(),
        }),
      )
      .optional(),
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm test schemas.test`
Expected: PASS (all describe blocks green).

- [ ] **Step 9: Typecheck**

Run: `pnpm typecheck`
Expected: clean. (Type errors in `actions.ts`/pages are expected until later tasks — if so, note them and continue; they are fixed in Tasks 2-8. Re-run typecheck at Task 9.)

- [ ] **Step 10: Commit**

```bash
git add lib/forms/application/schemas.ts lib/forms/application/schemas.test.ts
git commit -m "feat(application): add org/creator/presenter fields + 5-option format to schema"
```

---

## Task 2: Server actions (new org step, route shift, raw extraction)

**Files:**
- Modify: `lib/forms/application/actions.ts`

- [ ] **Step 1: Update `STEP_ROUTES`**

Replace the `STEP_ROUTES` array (lines ~48-54) with the 6-route version. `/new` is now the org step; Course Info moves to `/new/course`:

```ts
const STEP_ROUTES = [
  "/company/applications/new", // 0 — Organization & Contact (entry)
  "/company/applications/new/course", // 1 — Course Info
  "/company/applications/new/creator", // 2 — Creator
  "/company/applications/new/presenters", // 3 — Presenters
  "/company/applications/new/quiz", // 4 — Quiz
  "/company/applications/new/review", // 5 — Review
] as const;
```

- [ ] **Step 2: Add `saveOrgStep` and update imports**

Add `orgStepSchema` to the import from `@/lib/forms/application/schemas`. Then add a new action above `saveStep1`:

```ts
export async function saveOrgStep(formData: FormData) {
  const applicationId = String(formData.get("applicationId") ?? "");
  if (!applicationId) throw new Error("Missing applicationId");

  const raw = {
    organizationName: String(formData.get("organizationName") ?? ""),
    organizationAddress: String(formData.get("organizationAddress") ?? ""),
    adminName: String(formData.get("adminName") ?? ""),
    adminEmail: String(formData.get("adminEmail") ?? ""),
    adminPhone: String(formData.get("adminPhone") ?? ""),
  };
  await mergeStep(applicationId, orgStepSchema, raw, STEP_ROUTES[0]);
  redirect(STEP_ROUTES[1]);
}
```

- [ ] **Step 3: Update `saveStep1` raw + redirects**

In `saveStep1`, add the two new keys to `raw` and fix the route indices (Course Info is now `STEP_ROUTES[1]`, next is creator `STEP_ROUTES[2]`):

```ts
  const raw = {
    courseTitle: String(formData.get("courseTitle") ?? ""),
    ceCreditHours: Number(formData.get("ceCreditHours") ?? 0),
    subjectMatter: String(formData.get("subjectMatter") ?? ""),
    deliveryFormat: String(formData.get("deliveryFormat") ?? ""),
    primaryDistributionFormat: String(formData.get("primaryDistributionFormat") ?? ""),
    shortDescription: String(formData.get("shortDescription") ?? ""),
    combinedCert: formData.get("combinedCert") === "yes" ? true : formData.get("combinedCert") === "no" ? false : undefined,
    submitSessionsSeparately:
      formData.get("submitSessionsSeparately") === "yes"
        ? true
        : formData.get("submitSessionsSeparately") === "no"
          ? false
          : undefined,
    publicProtectionStatement: String(formData.get("publicProtectionStatement") ?? ""),
    courseObjectives: String(formData.get("courseObjectives") ?? ""),
    targetAudience: String(formData.get("targetAudience") ?? ""),
  };
  await mergeStep(applicationId, step1Schema, raw, STEP_ROUTES[1]);
  redirect(STEP_ROUTES[2]);
```

- [ ] **Step 4: Update `saveStep2` raw + redirects**

In `saveStep2`: the bio-length early redirect target becomes `STEP_ROUTES[2]` (creator is now index 2), add the new creator keys to `raw`, and fix the merge/redirect indices:

```ts
  if (richTextPlainLength(detailedBioHtml) < 20) {
    redirect(
      `${STEP_ROUTES[2]}?error=validation&detail=${encodeURIComponent(
        "Detailed bio: please write at least 20 characters.",
      )}`,
    );
  }

  const raw = {
    creatorName: String(formData.get("creatorName") ?? ""),
    credentials: String(formData.get("credentials") ?? ""),
    currentPosition: String(formData.get("currentPosition") ?? ""),
    detailedBioHtml,
    creatorEmail: String(formData.get("creatorEmail") ?? ""),
    creatorPhone: String(formData.get("creatorPhone") ?? ""),
    creatorAddress: String(formData.get("creatorAddress") ?? ""),
    highestDegree: String(formData.get("highestDegree") ?? ""),
    educationPart1: String(formData.get("educationPart1") ?? ""),
    educationPart2: String(formData.get("educationPart2") ?? "") || undefined,
    educationPart3: String(formData.get("educationPart3") ?? "") || undefined,
    educationPart4: String(formData.get("educationPart4") ?? "") || "N/A",
    creatorExperience: String(formData.get("creatorExperience") ?? ""),
  };
  await mergeStep(applicationId, step2Schema, raw, STEP_ROUTES[2]);
  redirect(STEP_ROUTES[3]);
```

- [ ] **Step 5: Update `saveStep3` raw + redirects**

In `saveStep3`, add the three new presenter fields and fix indices (presenters is now `STEP_ROUTES[3]`, next quiz `STEP_ROUTES[4]`):

```ts
  const presenters = [
    {
      name: String(formData.get("presenter_0_name") ?? ""),
      role: String(formData.get("presenter_0_role") ?? "Primary Presenter"),
      commercialDisclosure: String(formData.get("presenter_0_commercialDisclosure") ?? ""),
      experience: String(formData.get("presenter_0_experience") ?? ""),
      training: String(formData.get("presenter_0_training") ?? ""),
      bio: String(formData.get("presenter_0_bio") ?? ""),
    },
  ];
  await mergeStep(applicationId, step3Schema, { presenters }, STEP_ROUTES[3]);
  redirect(STEP_ROUTES[4]);
```

- [ ] **Step 6: Update `saveStep4` redirect index**

In `saveStep4`, the merge error route is quiz `STEP_ROUTES[4]` and the next is review `STEP_ROUTES[5]`:

```ts
  await mergeStep(applicationId, step4Schema, { quiz }, STEP_ROUTES[4]);
  redirect(STEP_ROUTES[5]);
```

- [ ] **Step 7: Update `submitApplication` validation-fail redirect**

The "missing fields, start over" redirect should send the user to the wizard entry (org step, `STEP_ROUTES[0]`) — it already uses `STEP_ROUTES[0]`, so no change is needed. Verify the line reads `${STEP_ROUTES[0]}?error=validation`. (No edit if already correct.)

- [ ] **Step 8: Typecheck**

Run: `pnpm typecheck`
Expected: page-level errors may remain (fixed in later tasks); `actions.ts` itself should have no new errors. Note remaining errors and continue.

- [ ] **Step 9: Commit**

```bash
git add lib/forms/application/actions.ts
git commit -m "feat(application): add saveOrgStep, shift step routes, extract new fields"
```

---

## Task 3: Step bar (6 steps)

**Files:**
- Modify: `components/application-form/step-bar.tsx`

- [ ] **Step 1: Update labels and the `currentStep` union**

Replace `stepLabels` and the `ApplicationStepBar` signature/casts:

```ts
const stepLabels = [
  "Organization",
  "Course Info",
  "Creator",
  "Presenters",
  "Quiz Builder",
  "Review",
];

export function ApplicationStepBar({
  currentStep,
}: {
  currentStep: 1 | 2 | 3 | 4 | 5 | 6;
}) {
```

Inside the map, change both `(i + 1) as 1 | 2 | 3 | 4 | 5` casts to `(i + 1) as 1 | 2 | 3 | 4 | 5 | 6`.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: step-bar compiles; page `currentStep={N}` props are updated in later tasks.

- [ ] **Step 3: Commit**

```bash
git add components/application-form/step-bar.tsx
git commit -m "feat(application): 6-step progress bar with Organization step"
```

---

## Task 4: New Organization step page + relocate Course Info

**Files:**
- Modify: `app/company/applications/new/page.tsx` (becomes the Organization step)
- Create: `app/company/applications/new/course/page.tsx` (relocated Course Info + new fields)

- [ ] **Step 1: Create the relocated Course Info page**

Create `app/company/applications/new/course/page.tsx` with the current Course Info content, `currentStep={2}`, subtitle "Step 2 of 6", a back nav to the org step, plus the two new fields and the Category relabel. Full file:

```tsx
import { PageHeader } from "@/components/portal-shell";
import { ApplicationStepBar } from "@/components/application-form/step-bar";
import {
  FormCard,
  FormErrorBanner,
  FormField,
  FormInput,
  FormLabel,
  FormNav,
  FormSelect,
  FormTextarea,
} from "@/components/application-form/form-controls";
import { requireApplicationCredits } from "@/lib/company/credit-guards";
import {
  DELIVERY_FORMATS,
  CATEGORIES,
  TARGET_AUDIENCES,
  isLiveFormat,
} from "@/lib/forms/application/schemas";
import { ensureDraft, getDraftData, saveStep1 } from "@/lib/forms/application/actions";
import { FileUploadField } from "@/components/application-form/file-upload-field";

// Category display labels: stored values stay "Scientific"/"Business..." for
// data compatibility; the UI shows "Scientific (Clinical)".
const CATEGORY_LABELS: Record<string, string> = {
  Scientific: "Scientific (Clinical)",
  "Business/Practice Management": "Business/Practice Management",
};

export default async function ApplicationCourseInfoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  const { credits: totalCredits } = await requireApplicationCredits();
  const { error, detail } = await searchParams;
  const applicationId = await ensureDraft();
  const draft = await getDraftData(applicationId);
  if (!draft.organizationName) redirect("/company/applications/new");

  const isLive = isLiveFormat(draft.deliveryFormat);

  return (
    <>
      <PageHeader
        title="Course Application"
        subtitle="Step 2 of 6 — Course Information"
        action={
          <span className="rounded-full bg-ace-bg px-2.5 py-1 text-[10px] font-bold text-ace-dark">
            {totalCredits.applicationCredits + totalCredits.expeditedCredits} Credits Available
          </span>
        }
      />
      <ApplicationStepBar currentStep={2} />
      {error === "validation" ? <FormErrorBanner detail={detail} /> : null}
      <form action={saveStep1} className="space-y-5">
        <input type="hidden" name="applicationId" value={applicationId} />
        <FormCard title="Step 2 — Course Information">
          <FormField fullWidth>
            <FormLabel required>Course Title</FormLabel>
            <FormInput
              name="courseTitle"
              defaultValue={draft.courseTitle ?? ""}
              required
              minLength={3}
              maxLength={200}
            />
          </FormField>
          <FormField>
            <FormLabel required hint="Exact hours, e.g. 1.5">CE Credit Hours</FormLabel>
            <FormInput
              type="number"
              step="0.5"
              min="0.5"
              max="40"
              name="ceCreditHours"
              defaultValue={draft.ceCreditHours ?? ""}
              required
            />
          </FormField>
          <FormField>
            <FormLabel required>Course Subject Matter</FormLabel>
            <select
              name="subjectMatter"
              defaultValue={draft.subjectMatter ?? CATEGORIES[0]}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] text-navy outline-none transition-colors focus:border-ace focus:ring-2 focus:ring-ace/30"
            >
              {CATEGORIES.map((opt) => (
                <option key={opt} value={opt}>
                  {CATEGORY_LABELS[opt] ?? opt}
                </option>
              ))}
            </select>
          </FormField>
          <FormField>
            <FormLabel required>Course Format</FormLabel>
            <FormSelect
              name="deliveryFormat"
              defaultValue={draft.deliveryFormat ?? DELIVERY_FORMATS[0]}
              options={DELIVERY_FORMATS}
            />
          </FormField>
          <FormField fullWidth>
            <FormLabel
              required
              hint="Live formats need a presenter available for Q&A; all formats require a 5-question quiz (built in a later step)."
            >
              Format you will use MOST to distribute this course
            </FormLabel>
            <FormSelect
              name="primaryDistributionFormat"
              defaultValue={draft.primaryDistributionFormat ?? DELIVERY_FORMATS[0]}
              options={DELIVERY_FORMATS}
            />
          </FormField>
          {isLive ? (
            <FormField fullWidth>
              <div className="rounded-md border-2 border-ace bg-ace-bg p-4">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-ace-dark">
                  ★ Live course detected — two questions before you continue
                </p>
                <div className="mb-4">
                  <FormLabel required>
                    Will live attendees receive one combined certificate for the
                    full event?
                  </FormLabel>
                  <div className="flex flex-col gap-2 text-[12px] text-text-mid sm:flex-row sm:gap-6">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="combinedCert"
                        value="yes"
                        defaultChecked={draft.combinedCert !== false}
                      />
                      Yes — one combined certificate
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="combinedCert"
                        value="no"
                        defaultChecked={draft.combinedCert === false}
                      />
                      No — one certificate per session
                    </label>
                  </div>
                </div>
                <div>
                  <FormLabel required>
                    Will individual sessions also be offered on-demand for CE
                    credit?
                  </FormLabel>
                  <div className="flex flex-col gap-2 text-[12px] text-text-mid">
                    <label className="flex items-start gap-2">
                      <input
                        type="radio"
                        name="submitSessionsSeparately"
                        value="yes"
                        defaultChecked={draft.submitSessionsSeparately === true}
                      />
                      <span>
                        <strong>Yes</strong>, I am submitting each session as its
                        own course application now. I&apos;ll tag them to this
                        event in Event Setup after they&apos;re approved.
                      </span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="submitSessionsSeparately"
                        value="no"
                        defaultChecked={draft.submitSessionsSeparately !== true}
                      />
                      No — live event only, no on-demand CE
                    </label>
                  </div>
                </div>
              </div>
            </FormField>
          ) : null}
          <FormField fullWidth>
            <FormLabel required hint="How does this course better enable participants to protect the public?">
              Public Protection Statement
            </FormLabel>
            <FormTextarea
              name="publicProtectionStatement"
              defaultValue={draft.publicProtectionStatement ?? ""}
              required
              minLength={20}
              maxLength={2000}
            />
          </FormField>
          <FormField fullWidth>
            <FormLabel required hint="Quick summary, no more than 2 concise paragraphs">
              Course Short Description
            </FormLabel>
            <FormTextarea
              name="shortDescription"
              defaultValue={draft.shortDescription ?? ""}
              required
              minLength={20}
              maxLength={1500}
              className="min-h-[110px]"
            />
          </FormField>
          <FormField fullWidth>
            <FormLabel required hint="Minimum 3, list each on a new line">
              Course Objectives
            </FormLabel>
            <FormTextarea
              name="courseObjectives"
              defaultValue={draft.courseObjectives ?? ""}
              required
              minLength={20}
              maxLength={2000}
              className="min-h-[110px]"
            />
          </FormField>
          <FormField>
            <FormLabel required>Target Audience</FormLabel>
            <FormSelect
              name="targetAudience"
              defaultValue={draft.targetAudience ?? TARGET_AUDIENCES[0]}
              options={TARGET_AUDIENCES}
            />
          </FormField>
          <FormField fullWidth>
            <FileUploadField
              applicationId={applicationId}
              field="courseOutline"
              label="Course Outline"
              existingFilename={draft.courseOutline?.filename}
            />
          </FormField>
        </FormCard>
        <FormNav
          back={{ href: "/company/applications/new", label: "Back" }}
          nextLabel="Next: Course Creator"
        />
      </form>
    </>
  );
}
```

Add the missing `redirect` import at the top:

```tsx
import { redirect } from "next/navigation";
```

- [ ] **Step 2: Rewrite `app/company/applications/new/page.tsx` as the Organization step**

Replace the entire file with the Organization & Contact step. It prefills org name from the company and admin from the logged-in user, only when the draft has no saved value:

```tsx
import { PageHeader } from "@/components/portal-shell";
import { ApplicationStepBar } from "@/components/application-form/step-bar";
import {
  FormCard,
  FormErrorBanner,
  FormField,
  FormInput,
  FormLabel,
  FormNav,
  FormTextarea,
} from "@/components/application-form/form-controls";
import { requireApplicationCredits } from "@/lib/company/credit-guards";
import { prisma } from "@/lib/prisma";
import { ensureDraft, getDraftData, saveOrgStep } from "@/lib/forms/application/actions";

/*
  Step 1 — Organization & Contact. Wizard entry: ensureDraft materializes the
  draft once per session. Org name prefills from the company; the process
  administrator prefills from the logged-in user. Saved draft values win over
  prefills so edits stick.
*/
export default async function ApplicationOrgStepPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  const { user, credits: totalCredits } = await requireApplicationCredits();
  const { error, detail } = await searchParams;
  const applicationId = await ensureDraft();
  const draft = await getDraftData(applicationId);

  const company = user.companyId
    ? await prisma.company.findUnique({
        where: { id: user.companyId },
        select: { name: true },
      })
    : null;

  const orgNameDefault = draft.organizationName ?? company?.name ?? "";
  const adminNameDefault =
    draft.adminName ??
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  const adminEmailDefault = draft.adminEmail ?? user.email ?? "";

  return (
    <>
      <PageHeader
        title="Course Application"
        subtitle="Step 1 of 6 — Organization & Contact"
        action={
          <span className="rounded-full bg-ace-bg px-2.5 py-1 text-[10px] font-bold text-ace-dark">
            {totalCredits.applicationCredits + totalCredits.expeditedCredits} Credits Available
          </span>
        }
      />
      <ApplicationStepBar currentStep={1} />
      {error === "validation" ? <FormErrorBanner detail={detail} /> : null}
      <form action={saveOrgStep} className="space-y-5">
        <input type="hidden" name="applicationId" value={applicationId} />
        <FormCard title="Step 1 — Organization & Contact">
          <FormField fullWidth>
            <FormLabel required>
              Name of Organization / Company / Association / Individual
            </FormLabel>
            <FormInput
              name="organizationName"
              defaultValue={orgNameDefault}
              required
              minLength={2}
              maxLength={200}
            />
          </FormField>
          <FormField fullWidth>
            <FormLabel required hint="City, State, Zip">
              Organization Full Address
            </FormLabel>
            <FormTextarea
              name="organizationAddress"
              defaultValue={draft.organizationAddress ?? ""}
              required
              minLength={5}
              maxLength={400}
            />
          </FormField>
          <FormField fullWidth>
            <FormLabel
              required
              hint="Responsible for all interactions, communications, and billing"
            >
              Process Administrator — Full Name
            </FormLabel>
            <FormInput
              name="adminName"
              defaultValue={adminNameDefault}
              required
              minLength={2}
              maxLength={200}
            />
          </FormField>
          <FormField>
            <FormLabel required>Process Administrator — Email</FormLabel>
            <FormInput
              type="email"
              name="adminEmail"
              defaultValue={adminEmailDefault}
              required
            />
          </FormField>
          <FormField>
            <FormLabel required>Process Administrator — Phone</FormLabel>
            <FormInput
              type="tel"
              name="adminPhone"
              defaultValue={draft.adminPhone ?? ""}
              required
              minLength={7}
              maxLength={40}
            />
          </FormField>
        </FormCard>
        <FormNav nextLabel="Next: Course Information" />
      </form>
    </>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: these two pages compile (creator/presenters/review still pending in later tasks).

- [ ] **Step 4: Commit**

```bash
git add app/company/applications/new/page.tsx app/company/applications/new/course/page.tsx
git commit -m "feat(application): add Organization step, relocate Course Info to /course"
```

---

## Task 5: Creator step page additions

**Files:**
- Modify: `app/company/applications/new/creator/page.tsx`

- [ ] **Step 1: Update guard, step bar, subtitle, back nav, and add new fields**

Make these edits:

1. Add `HIGHEST_DEGREES` and `FormSelect`, `FormTextarea` to imports:

```tsx
import {
  FormCard,
  FormErrorBanner,
  FormField,
  FormInput,
  FormLabel,
  FormNav,
  FormSelect,
  FormTextarea,
} from "@/components/application-form/form-controls";
import { HIGHEST_DEGREES } from "@/lib/forms/application/schemas";
```

2. The guard redirect target changes (Course Info now lives at `/course`):

```tsx
  if (!draft.courseTitle) redirect("/company/applications/new/course");
```

3. Subtitle and step bar:

```tsx
        subtitle="Step 3 of 6 — Course Creator"
```
```tsx
      <ApplicationStepBar currentStep={3} />
```

4. After the existing Current Position field (before the Detailed Bio field), insert the new creator fields:

```tsx
          <FormField>
            <FormLabel required>Course Creator — Email</FormLabel>
            <FormInput type="email" name="creatorEmail" defaultValue={draft.creatorEmail ?? ""} required />
          </FormField>
          <FormField>
            <FormLabel required>Course Creator — Phone</FormLabel>
            <FormInput type="tel" name="creatorPhone" defaultValue={draft.creatorPhone ?? ""} required minLength={7} maxLength={40} />
          </FormField>
          <FormField fullWidth>
            <FormLabel required hint="City, State, Zip">Course Creator — Address</FormLabel>
            <FormInput name="creatorAddress" defaultValue={draft.creatorAddress ?? ""} required minLength={5} maxLength={400} />
          </FormField>
          <FormField>
            <FormLabel required>Highest Earned Educational Degree</FormLabel>
            <FormSelect name="highestDegree" defaultValue={draft.highestDegree ?? HIGHEST_DEGREES[0]} options={HIGHEST_DEGREES} />
          </FormField>
          <FormField fullWidth>
            <FormLabel required hint="Universities/colleges attended, degree(s) & graduation date(s)">
              Education — Part 1
            </FormLabel>
            <FormTextarea name="educationPart1" defaultValue={draft.educationPart1 ?? ""} required minLength={2} maxLength={1000} />
          </FormField>
          <FormField fullWidth>
            <FormLabel hint="Other training relevant to mentoring this course (optional)">
              Education — Part 2
            </FormLabel>
            <FormTextarea name="educationPart2" defaultValue={draft.educationPart2 ?? ""} maxLength={1000} />
          </FormField>
          <FormField fullWidth>
            <FormLabel hint="Technical degree(s), college(s) attended, date(s) of graduation (optional)">
              Education — Part 3
            </FormLabel>
            <FormTextarea name="educationPart3" defaultValue={draft.educationPart3 ?? ""} maxLength={1000} />
          </FormField>
          <FormField fullWidth>
            <FormLabel hint="Other applicable info. If none, type N/A">
              Education — Part 4
            </FormLabel>
            <FormTextarea name="educationPart4" defaultValue={draft.educationPart4 ?? "N/A"} maxLength={1000} />
          </FormField>
          <FormField fullWidth>
            <FormLabel required hint="e.g. Research department working on dental materials for 6 years">
              Experience Relative to Course Subject Matter
            </FormLabel>
            <FormTextarea name="creatorExperience" defaultValue={draft.creatorExperience ?? ""} required minLength={10} maxLength={2000} />
          </FormField>
```

5. Back nav target (Course Info moved):

```tsx
        <FormNav
          back={{ href: "/company/applications/new/course", label: "Back" }}
          nextLabel="Next: Presenters"
        />
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: creator page compiles.

- [ ] **Step 3: Commit**

```bash
git add app/company/applications/new/creator/page.tsx
git commit -m "feat(application): add creator contact, degree, education, and experience fields"
```

---

## Task 6: Presenters step page additions

**Files:**
- Modify: `app/company/applications/new/presenters/page.tsx`

- [ ] **Step 1: Update step bar/subtitle and add the three presenter fields**

1. Subtitle + step bar:

```tsx
      <PageHeader title="Course Application" subtitle="Step 4 of 6 — Presenters" />
```
```tsx
      <ApplicationStepBar currentStep={4} />
```

2. After the Commercial Disclosure field (before the headshot `FileUploadField`), insert:

```tsx
          <FormField fullWidth>
            <FormLabel required hint="Last Name, First Name, experience relative to course matter">
              Experience Relative to Course Matter
            </FormLabel>
            <FormTextarea
              name="presenter_0_experience"
              defaultValue={primary?.experience ?? ""}
              required
              minLength={2}
              maxLength={1000}
            />
          </FormField>
          <FormField fullWidth>
            <FormLabel required hint="How much time, and a description — live, paper, or digital?">
              Training Received by Presenter
            </FormLabel>
            <FormTextarea
              name="presenter_0_training"
              defaultValue={primary?.training ?? ""}
              required
              minLength={2}
              maxLength={1000}
            />
          </FormField>
          <FormField fullWidth>
            <FormLabel required hint="Include name and title">Presenter Bio</FormLabel>
            <FormTextarea
              name="presenter_0_bio"
              defaultValue={primary?.bio ?? ""}
              required
              minLength={2}
              maxLength={2000}
            />
          </FormField>
```

Note: the existing top-level headshot `FileUploadField` stays as-is — only the per-presenter headshot (#29) was dropped, and that was never built.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: presenters page compiles. (`primary?.experience` etc. resolve because `step3Schema`'s presenter type now includes them.)

- [ ] **Step 3: Commit**

```bash
git add app/company/applications/new/presenters/page.tsx
git commit -m "feat(application): add per-presenter experience, training, and bio"
```

---

## Task 7: Quiz step page (step-number-only updates)

**Files:**
- Modify: `app/company/applications/new/quiz/page.tsx`

- [ ] **Step 1: Update the step bar and subtitle**

Read the file first. Change `<ApplicationStepBar currentStep={4} />` to `currentStep={5}`, and any subtitle "Step 4 of 5" to "Step 5 of 6". Leave the quiz fields and the back nav (to `/presenters`) unchanged. If the page has no subtitle/step bar, make no change.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/company/applications/new/quiz/page.tsx
git commit -m "chore(application): renumber quiz step to 5 of 6"
```

---

## Task 8: Review + reviewer detail display

**Files:**
- Modify: `app/company/applications/new/review/page.tsx`
- Modify: `app/reviewer/[applicationId]/page.tsx`

- [ ] **Step 1: Review page — step bar + new sections/rows**

1. Change `<ApplicationStepBar currentStep={5} />` to `currentStep={6}`.

2. Add an Organization section as the first `ReviewCard` (above Section A):

```tsx
        <ReviewCard
          title="Section A — Organization & Contact"
          editHref="/company/applications/new"
          rows={[
            { label: "Organization", value: data.organizationName },
            { label: "Address", value: data.organizationAddress, full: true },
            { label: "Process Administrator", value: data.adminName },
            { label: "Admin Email", value: data.adminEmail },
            { label: "Admin Phone", value: data.adminPhone },
          ]}
        />
```

3. Relabel the existing Section A → "Section B — Course Information", change its `editHref` to `/company/applications/new/course`, and add the two new rows (after "Delivery Format"):

```tsx
            { label: "Course Format", value: data.deliveryFormat },
            { label: "Most-Used Format", value: data.primaryDistributionFormat },
            { label: "Short Description", value: data.shortDescription, full: true },
```

4. In Section "Course Creator" (now Section C), add rows after "Current Position":

```tsx
            { label: "Creator Email", value: data.creatorEmail },
            { label: "Creator Phone", value: data.creatorPhone },
            { label: "Creator Address", value: data.creatorAddress, full: true },
            { label: "Highest Degree", value: data.highestDegree },
            { label: "Education — Part 1", value: data.educationPart1, full: true },
            ...(data.educationPart2 ? [{ label: "Education — Part 2", value: data.educationPart2, full: true }] : []),
            ...(data.educationPart3 ? [{ label: "Education — Part 3", value: data.educationPart3, full: true }] : []),
            { label: "Education — Part 4", value: data.educationPart4, full: true },
            { label: "Experience Relative to Subject", value: data.creatorExperience, full: true },
```

5. In the Presenters section, expand the per-presenter rows:

```tsx
          rows={data.presenters.flatMap((p, i) => [
            { label: `Presenter ${i + 1}`, value: `${p.name} · ${p.role}` },
            { label: "Commercial Disclosure", value: p.commercialDisclosure, full: true },
            { label: "Experience", value: p.experience, full: true },
            { label: "Training Received", value: p.training, full: true },
            { label: "Bio", value: p.bio, full: true },
          ])}
```

(Section letter labels in titles are cosmetic; renumber the remaining titles B→C→D→E for consistency.)

- [ ] **Step 2: Reviewer detail page — new rows**

In `app/reviewer/[applicationId]/page.tsx`, the data comes from `applicationDataReadSchema`, so all new fields are optional — guard each with a presence check.

1. Add an Organization section before "Section A — Course Information":

```tsx
          <Section
            title="Organization & Contact"
            rows={[
              ...(data.organizationName ? [{ label: "Organization", value: data.organizationName, full: true }] : []),
              ...(data.organizationAddress ? [{ label: "Address", value: data.organizationAddress, full: true }] : []),
              ...(data.adminName ? [{ label: "Process Administrator", value: data.adminName }] : []),
              ...(data.adminEmail ? [{ label: "Admin Email", value: data.adminEmail }] : []),
              ...(data.adminPhone ? [{ label: "Admin Phone", value: data.adminPhone }] : []),
            ]}
          />
```

2. In Section A (Course Information) rows, after the "Delivery Format" row, add:

```tsx
              ...(data.primaryDistributionFormat
                ? [{ label: "Most-Used Format", value: data.primaryDistributionFormat }]
                : []),
              ...(data.shortDescription
                ? [{ label: "Short Description", value: data.shortDescription, full: true }]
                : []),
```

3. In Section B (Course Creator) rows, after "Current Position", add:

```tsx
              ...(data.creatorEmail ? [{ label: "Creator Email", value: data.creatorEmail }] : []),
              ...(data.creatorPhone ? [{ label: "Creator Phone", value: data.creatorPhone }] : []),
              ...(data.creatorAddress ? [{ label: "Creator Address", value: data.creatorAddress, full: true }] : []),
              ...(data.highestDegree ? [{ label: "Highest Degree", value: data.highestDegree }] : []),
              ...(data.educationPart1 ? [{ label: "Education — Part 1", value: data.educationPart1, full: true }] : []),
              ...(data.educationPart2 ? [{ label: "Education — Part 2", value: data.educationPart2, full: true }] : []),
              ...(data.educationPart3 ? [{ label: "Education — Part 3", value: data.educationPart3, full: true }] : []),
              ...(data.educationPart4 ? [{ label: "Education — Part 4", value: data.educationPart4, full: true }] : []),
              ...(data.creatorExperience ? [{ label: "Experience Relative to Subject", value: data.creatorExperience, full: true }] : []),
```

4. In Section C (Presenters), expand the per-presenter rows with presence guards:

```tsx
            rows={data.presenters.flatMap((p, i) => [
              { label: `Presenter ${i + 1}`, value: `${p.name} · ${p.role}` },
              ...(p.commercialDisclosure ? [{ label: "Commercial Disclosure", value: p.commercialDisclosure, full: true }] : []),
              ...(p.experience ? [{ label: "Experience", value: p.experience, full: true }] : []),
              ...(p.training ? [{ label: "Training Received", value: p.training, full: true }] : []),
              ...(p.bio ? [{ label: "Bio", value: p.bio, full: true }] : []),
            ])}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean (read-schema fields are optional strings; presence guards satisfy the `value: string` row type).

- [ ] **Step 4: Commit**

```bash
git add app/company/applications/new/review/page.tsx "app/reviewer/[applicationId]/page.tsx"
git commit -m "feat(application): show new org/creator/presenter fields in review + reviewer detail"
```

---

## Task 9: Full verification + inbound-link check

**Files:** none (verification only)

- [ ] **Step 1: Confirm no inbound link assumes `/new` is Course Info**

Run: `grep -rn "applications/new" app components lib --include=*.tsx --include=*.ts | grep -v "applications/new/"`
Expected: hits are the wizard entry (now the org step) and back-nav — all correct, since starting an application should land on the org step. If any "start new application" link expected Course Info specifically, it still correctly lands on step 1 (org). No change needed unless a link targets the old course content directly.

- [ ] **Step 2: Run the full test suite**

Run: `pnpm test`
Expected: PASS, including `schemas.test.ts`.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Production build**

Run: `pnpm build`
Expected: build succeeds; `/company/applications/new` and `/company/applications/new/course` both appear as routes.

- [ ] **Step 5: Manual smoke (optional but recommended)**

Start `pnpm dev`, sign in as `customer@dentalace.org`, and walk the wizard: Organization (prefilled) → Course Info (5 format options, short description) → Creator (degree + education) → Presenters (experience/training/bio) → Quiz → Review. Confirm Review shows every new field and Submit succeeds. Open the application in `/reviewer` and confirm the new fields render. Also open a pre-existing (legacy) application in `/reviewer` and confirm it still renders without the "malformed" error.

- [ ] **Step 6: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "test(application): verify form field expansion end-to-end"
```

---

## Self-review notes

- **Spec coverage:** Every field #1-28 maps to a task (org #2-6 → Tasks 1/2/4; course #9/11/13/14 → Tasks 1/2/4; creator #16-24 → Tasks 1/2/5; presenter #26-28 → Tasks 1/2/6). #29 intentionally excluded. Display surfaces (reviewer + review) → Task 8. Backward compatibility → Task 1 Step 7.
- **Route shift:** `/new` → org, course → `/new/course`; all `currentStep`, subtitles, guards, and back-nav hrefs updated in Tasks 3-8.
- **Type consistency:** new field names (`organizationName`, `primaryDistributionFormat`, `highestDegree`, `educationPart1-4`, `creatorExperience`, presenter `experience`/`training`/`bio`) are identical across schema, actions `raw` extraction, form `name=` attributes, and display rows.
