# Dental ACE M1 — Attendee → Certificate Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public attendee flow that closes the Dental ACE loop — an attendee opens a course link, completes a 4-step form, passes a 5-question quiz, and receives a certificate PDF by email — backed by atomic cert-balance accounting, a certificate log with signed downloads, rate limiting, and a Vitest suite covering the money/state paths.

**Architecture:** Pure, dependency-free logic modules (`scoring`, `lockout`, `credit-pool`, `course-id`, `rate-limit`) are unit-tested in isolation. A `"use server"` action (`lib/attend/actions.ts`) orchestrates them with Prisma, Storage, PDF, and email — mirroring the existing approve flow in `lib/reviewer/actions.ts`. The cert-balance decrement runs in a transaction with a `SELECT … FOR UPDATE` lock on the `companies` row, exactly like `submitApplication`. The certificate PDF uses PDFKit (`lib/pdf/certificate.ts`), mirroring `lib/pdf/approval-letter.ts`. No new DB tables: failed quiz attempts are rows in `issued_certificates` with `passed=false`.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, Prisma 7, PDFKit, Supabase Storage, Resend + React Email, Zod, **Vitest** (new) + `vite-tsconfig-paths`.

**Spec:** `docs/superpowers/specs/2026-06-02-dentalace-launch-completion-design.md` (M1 section).

---

## File Structure

**New — pure logic (no `server-only`, unit-tested directly):**
- `lib/attend/scoring.ts` — quiz scoring (3/5 threshold).
- `lib/attend/lockout.ts` — attempt/retake/lockout decision.
- `lib/attend/schemas.ts` — Zod schema for the attendee submission.
- `lib/billing/credit-pool.ts` — credit-pool selection (extracted from `submitApplication`).
- `lib/reviewer/course-id.ts` — Course-ID sequence/format (extracted from `lib/reviewer/actions.ts`).
- `lib/rate-limit.ts` — in-memory token-bucket limiter (injectable clock).

**New — server-side:**
- `lib/attend/issue.ts` — `issueCertificateTx` (balance decrement + cert insert; `server-only`).
- `lib/attend/actions.ts` — `submitAttendance` server action (orchestration).
- `lib/pdf/certificate.ts` — PDFKit certificate renderer (`server-only`).
- `emails/certificate-issued.tsx` — React Email template.
- `app/attend/[token]/page.tsx` — public attendee page (fails closed).
- `app/attend/[token]/loading.tsx`, `app/attend/[token]/error.tsx` — boundaries.
- `components/attend/attendee-form.tsx` — 4-step client form.

**New — tests + harness:**
- `vitest.config.ts`, `test/stubs/server-only.ts`.
- `lib/attend/scoring.test.ts`, `lib/attend/lockout.test.ts`, `lib/attend/schemas.test.ts`, `lib/attend/issue.test.ts`.
- `lib/billing/credit-pool.test.ts`, `lib/billing/webhook-core.test.ts`.
- `lib/reviewer/course-id.test.ts`, `lib/rate-limit.test.ts`, `lib/pdf/certificate.test.ts`.

**Modified:**
- `package.json` — add `vitest`, `vite-tsconfig-paths`, `test` script.
- `lib/reviewer/actions.ts` — use extracted `course-id.ts`.
- `lib/forms/application/actions.ts` — use extracted `credit-pool.ts`.
- `app/company/certificates/page.tsx` — real list + search + pagination + signed URLs.
- `.env.example` — document the Resend/admin/reviewer vars.

---

## Task 1: Stand up Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`, `test/stubs/server-only.ts`, `lib/sanity.test.ts` (temporary)

- [ ] **Step 1: Install dev dependencies**

Run:
```bash
pnpm add -D vitest vite-tsconfig-paths
```
Expected: both appear under `devDependencies` in `package.json`.

- [ ] **Step 2: Add the `test` script**

In `package.json` `"scripts"`, add:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Create the `server-only` stub**

`server-only` throws if imported outside a React Server Component, which breaks Node test runs. Alias it to an empty module in tests.

`test/stubs/server-only.ts`:
```ts
// Empty stub so modules importing "server-only" can be unit-tested under Vitest.
export {};
```

- [ ] **Step 4: Create the Vitest config**

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./test/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules", ".next"],
  },
});
```

- [ ] **Step 5: Write a sanity test**

`lib/sanity.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("vitest harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run it**

Run: `pnpm test`
Expected: PASS, 1 test passed.

- [ ] **Step 7: Remove the sanity test and commit**

```bash
rm lib/sanity.test.ts
git add package.json pnpm-lock.yaml vitest.config.ts test/stubs/server-only.ts
git commit -m "test: stand up vitest harness with tsconfig paths + server-only stub"
```

---

## Task 2: Quiz scoring module

**Files:**
- Create: `lib/attend/scoring.ts`
- Test: `lib/attend/scoring.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/attend/scoring.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { scoreQuiz, PASS_THRESHOLD, type AttendeeAnswer } from "@/lib/attend/scoring";
import type { QuizQuestion } from "@/lib/forms/application/schemas";

const questions: QuizQuestion[] = [
  { type: "TF", question: "q1", correctAnswer: "True" },
  { type: "TF", question: "q2", correctAnswer: "False" },
  { type: "MC", question: "q3", options: ["a", "b", "c", "d"], correctIndex: 1 },
  { type: "MC", question: "q4", options: ["a", "b", "c", "d"], correctIndex: 2 },
  { type: "MC", question: "q5", options: ["a", "b", "c", "d"], correctIndex: 3 },
];

const all = (xs: AttendeeAnswer[]) => xs;

describe("scoreQuiz", () => {
  it("scores a perfect quiz as 5 and passed", () => {
    const answers = all([
      { type: "TF", answer: "True" },
      { type: "TF", answer: "False" },
      { type: "MC", answer: 1 },
      { type: "MC", answer: 2 },
      { type: "MC", answer: 3 },
    ]);
    expect(scoreQuiz(questions, answers)).toEqual({
      score: 5,
      passed: true,
      correct: [true, true, true, true, true],
    });
  });

  it("passes at exactly the threshold (3/5)", () => {
    const answers = all([
      { type: "TF", answer: "True" },   // correct
      { type: "TF", answer: "True" },   // wrong
      { type: "MC", answer: 1 },        // correct
      { type: "MC", answer: 0 },        // wrong
      { type: "MC", answer: 3 },        // correct
    ]);
    const result = scoreQuiz(questions, answers);
    expect(result.score).toBe(PASS_THRESHOLD);
    expect(result.passed).toBe(true);
  });

  it("fails below the threshold (2/5)", () => {
    const answers = all([
      { type: "TF", answer: "True" },
      { type: "TF", answer: "True" },
      { type: "MC", answer: 1 },
      { type: "MC", answer: 0 },
      { type: "MC", answer: 0 },
    ]);
    const result = scoreQuiz(questions, answers);
    expect(result.score).toBe(2);
    expect(result.passed).toBe(false);
  });

  it("counts a type mismatch as wrong", () => {
    const answers = all([
      { type: "MC", answer: 0 } as AttendeeAnswer, // mismatch vs TF
      { type: "TF", answer: "False" },
      { type: "MC", answer: 1 },
      { type: "MC", answer: 2 },
      { type: "MC", answer: 3 },
    ]);
    const result = scoreQuiz(questions, answers);
    expect(result.correct[0]).toBe(false);
    expect(result.score).toBe(4);
  });

  it("throws when answer count does not match", () => {
    expect(() => scoreQuiz(questions, [])).toThrow(/count/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test lib/attend/scoring.test.ts`
Expected: FAIL — cannot resolve `@/lib/attend/scoring`.

- [ ] **Step 3: Implement the module**

`lib/attend/scoring.ts`:
```ts
import type { QuizQuestion } from "@/lib/forms/application/schemas";

/*
  Pure quiz scorer. No DB, no server-only — unit-tested directly.
  Pass threshold is 3 of 5 (PRD Flow C).
*/

export const PASS_THRESHOLD = 3;

export type AttendeeAnswer =
  | { type: "TF"; answer: "True" | "False" }
  | { type: "MC"; answer: number };

export type QuizResult = {
  score: number;
  passed: boolean;
  correct: boolean[];
};

export function scoreQuiz(
  questions: QuizQuestion[],
  answers: AttendeeAnswer[],
): QuizResult {
  if (questions.length !== answers.length) {
    throw new Error(
      `answer count (${answers.length}) does not match question count (${questions.length})`,
    );
  }
  const correct = questions.map((q, i) => {
    const a = answers[i];
    if (q.type === "TF" && a.type === "TF") return a.answer === q.correctAnswer;
    if (q.type === "MC" && a.type === "MC") return a.answer === q.correctIndex;
    return false;
  });
  const score = correct.filter(Boolean).length;
  return { score, passed: score >= PASS_THRESHOLD, correct };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test lib/attend/scoring.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/attend/scoring.ts lib/attend/scoring.test.ts
git commit -m "feat(attend): pure quiz scorer with 3/5 pass threshold"
```

---

## Task 3: Lockout decision module

**Files:**
- Create: `lib/attend/lockout.ts`
- Test: `lib/attend/lockout.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/attend/lockout.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { decideAttempt, MAX_ATTEMPTS } from "@/lib/attend/lockout";

describe("decideAttempt", () => {
  it("short-circuits when a passing cert already exists", () => {
    expect(decideAttempt({ passedExists: true, failedCount: 0 })).toEqual({
      kind: "already_certified",
    });
  });

  it("allows the first attempt (not final)", () => {
    expect(decideAttempt({ passedExists: false, failedCount: 0 })).toEqual({
      kind: "allowed",
      isFinalAttempt: false,
    });
  });

  it("allows the retake and marks it final", () => {
    expect(decideAttempt({ passedExists: false, failedCount: 1 })).toEqual({
      kind: "allowed",
      isFinalAttempt: true,
    });
  });

  it("locks out after MAX_ATTEMPTS fails", () => {
    expect(decideAttempt({ passedExists: false, failedCount: MAX_ATTEMPTS })).toEqual({
      kind: "locked_out",
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test lib/attend/lockout.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement the module**

`lib/attend/lockout.ts`:
```ts
/*
  Pure attempt/retake/lockout decision. The PRD allows one retake: an attendee
  gets the original attempt plus one more, then is locked out of this course.
  Identity is (course_id + lowercased email); the caller supplies the counts.
*/

export const MAX_ATTEMPTS = 2; // original + one retake

export type PriorAttempts = {
  passedExists: boolean;
  failedCount: number;
};

export type AttemptDecision =
  | { kind: "already_certified" }
  | { kind: "locked_out" }
  | { kind: "allowed"; isFinalAttempt: boolean };

export function decideAttempt(prior: PriorAttempts): AttemptDecision {
  if (prior.passedExists) return { kind: "already_certified" };
  if (prior.failedCount >= MAX_ATTEMPTS) return { kind: "locked_out" };
  return { kind: "allowed", isFinalAttempt: prior.failedCount === MAX_ATTEMPTS - 1 };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test lib/attend/lockout.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/attend/lockout.ts lib/attend/lockout.test.ts
git commit -m "feat(attend): pure retake/lockout decision"
```

---

## Task 4: Extract + test the Course-ID generator

**Files:**
- Create: `lib/reviewer/course-id.ts`
- Test: `lib/reviewer/course-id.test.ts`
- Modify: `lib/reviewer/actions.ts:44-57`

- [ ] **Step 1: Write the failing test**

`lib/reviewer/course-id.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { formatCourseId, nextSeqFromLast } from "@/lib/reviewer/course-id";

describe("course-id", () => {
  it("starts at 1 when no prior course exists", () => {
    expect(nextSeqFromLast(null)).toBe(1);
  });

  it("increments from the last sequence", () => {
    expect(nextSeqFromLast("ACE-2026-00041")).toBe(42);
  });

  it("treats an unparseable tail as 0 -> 1", () => {
    expect(nextSeqFromLast("ACE-2026-XYZ")).toBe(1);
  });

  it("formats with year + zero-padded 5-digit sequence", () => {
    expect(formatCourseId(2026, 42)).toBe("ACE-2026-00042");
    expect(formatCourseId(2027, 1)).toBe("ACE-2027-00001");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test lib/reviewer/course-id.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement the pure module**

`lib/reviewer/course-id.ts`:
```ts
/*
  Pure Course-ID helpers, extracted from the approve action so they can be
  unit-tested. Format: ACE-YYYY-##### (year + zero-padded 5-digit sequence).
  Sequence allocation must still happen under a year-scoped advisory lock in
  the caller; these functions only format and increment.
*/

export function nextSeqFromLast(lastCourseIdNumber: string | null): number {
  if (!lastCourseIdNumber) return 1;
  const lastSeq = Number(lastCourseIdNumber.split("-").at(-1));
  return (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
}

export function formatCourseId(year: number, seq: number): string {
  return `ACE-${year}-${String(seq).padStart(5, "0")}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test lib/reviewer/course-id.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Refactor the approve action to use the helpers**

In `lib/reviewer/actions.ts`, add to the imports near the top (after line 11):
```ts
import { formatCourseId, nextSeqFromLast } from "@/lib/reviewer/course-id";
```

Replace the body of `nextCourseIdNumber` (lines 48-56) so it reads:
```ts
  const prefix = `ACE-${year}-`;
  const last = await tx.accreditedCourse.findFirst({
    where: { courseIdNumber: { startsWith: prefix } },
    orderBy: { courseIdNumber: "desc" },
    select: { courseIdNumber: true },
  });
  return formatCourseId(year, nextSeqFromLast(last?.courseIdNumber ?? null));
```

- [ ] **Step 6: Verify typecheck stays clean**

Run: `pnpm typecheck`
Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add lib/reviewer/course-id.ts lib/reviewer/course-id.test.ts lib/reviewer/actions.ts
git commit -m "refactor(reviewer): extract + test Course-ID generator"
```

---

## Task 5: Extract + test credit-pool selection

**Files:**
- Create: `lib/billing/credit-pool.ts`
- Test: `lib/billing/credit-pool.test.ts`
- Modify: `lib/forms/application/actions.ts:220-241`

- [ ] **Step 1: Write the failing test**

`lib/billing/credit-pool.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { chooseCreditPool } from "@/lib/billing/credit-pool";

describe("chooseCreditPool", () => {
  it("uses expedited when opted in and available", () => {
    expect(chooseCreditPool({ useExpedited: true, applicationCredits: 5, expeditedCredits: 2 })).toBe("expedited");
  });

  it("falls back to standard when expedited opted in but none left", () => {
    expect(chooseCreditPool({ useExpedited: true, applicationCredits: 5, expeditedCredits: 0 })).toBe("standard");
  });

  it("uses standard when not opted into expedited", () => {
    expect(chooseCreditPool({ useExpedited: false, applicationCredits: 5, expeditedCredits: 9 })).toBe("standard");
  });

  it("returns none when no credits are available", () => {
    expect(chooseCreditPool({ useExpedited: false, applicationCredits: 0, expeditedCredits: 0 })).toBe("none");
    expect(chooseCreditPool({ useExpedited: true, applicationCredits: 0, expeditedCredits: 0 })).toBe("none");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test lib/billing/credit-pool.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement the pure module**

`lib/billing/credit-pool.ts`:
```ts
/*
  Pure decision: which credit pool a submission spends. Expedited wins only if
  the customer opted in AND the company has an expedited credit; otherwise the
  standard pool pays if it can; otherwise no credit is available.
*/

export type CreditPool = "expedited" | "standard" | "none";

export function chooseCreditPool(args: {
  useExpedited: boolean;
  applicationCredits: number;
  expeditedCredits: number;
}): CreditPool {
  if (args.useExpedited && args.expeditedCredits > 0) return "expedited";
  if (args.applicationCredits > 0) return "standard";
  return "none";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test lib/billing/credit-pool.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Refactor `submitApplication` to use it**

In `lib/forms/application/actions.ts`, add to imports (after line 18):
```ts
import { chooseCreditPool } from "@/lib/billing/credit-pool";
```

Replace the credit-consumption branch inside the transaction (lines 228-241, the `if (useExpedited && …) … else … else throw` block) with:
```ts
    const pool = chooseCreditPool({
      useExpedited,
      applicationCredits: company.applicationCredits,
      expeditedCredits: company.expeditedCredits,
    });
    if (pool === "expedited") {
      appliedExpedited = true;
      await tx.company.update({
        where: { id: companyId },
        data: { expeditedCredits: { decrement: 1 } },
      });
    } else if (pool === "standard") {
      await tx.company.update({
        where: { id: companyId },
        data: { applicationCredits: { decrement: 1 } },
      });
    } else {
      throw new Error("No application credits available");
    }
```

- [ ] **Step 6: Verify typecheck**

Run: `pnpm typecheck`
Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add lib/billing/credit-pool.ts lib/billing/credit-pool.test.ts lib/forms/application/actions.ts
git commit -m "refactor(billing): extract + test credit-pool selection"
```

---

## Task 6: Rate limiter

**Files:**
- Create: `lib/rate-limit.ts`
- Test: `lib/rate-limit.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/rate-limit.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, __resetRateLimit } from "@/lib/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => __resetRateLimit());

  it("allows up to the limit within the window", () => {
    const opts = { limit: 3, windowMs: 1000 };
    expect(rateLimit("k", opts, 0).ok).toBe(true);
    expect(rateLimit("k", opts, 100).ok).toBe(true);
    expect(rateLimit("k", opts, 200).ok).toBe(true);
  });

  it("blocks the request that exceeds the limit", () => {
    const opts = { limit: 2, windowMs: 1000 };
    rateLimit("k", opts, 0);
    rateLimit("k", opts, 10);
    const blocked = rateLimit("k", opts, 20);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets after the window elapses", () => {
    const opts = { limit: 1, windowMs: 1000 };
    expect(rateLimit("k", opts, 0).ok).toBe(true);
    expect(rateLimit("k", opts, 500).ok).toBe(false);
    expect(rateLimit("k", opts, 1000).ok).toBe(true);
  });

  it("tracks keys independently", () => {
    const opts = { limit: 1, windowMs: 1000 };
    expect(rateLimit("a", opts, 0).ok).toBe(true);
    expect(rateLimit("b", opts, 0).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test lib/rate-limit.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement the limiter**

`lib/rate-limit.ts`:
```ts
/*
  Minimal in-memory fixed-window rate limiter. The clock is injectable for
  deterministic tests. Single-instance only; when the app runs on multiple
  serverless instances this must move to a shared store (e.g. Upstash). The
  attendee form, login, and application submit are the throttled surfaces.
*/

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitOptions = { limit: number; windowMs: number };
export type RateLimitResult = { ok: boolean; remaining: number; retryAfterMs: number };

export function rateLimit(
  key: string,
  opts: RateLimitOptions,
  now: number = Date.now(),
): RateLimitResult {
  const existing = buckets.get(key);
  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, remaining: opts.limit - 1, retryAfterMs: 0 };
  }
  if (existing.count >= opts.limit) {
    return { ok: false, remaining: 0, retryAfterMs: existing.resetAt - now };
  }
  existing.count += 1;
  return { ok: true, remaining: opts.limit - existing.count, retryAfterMs: 0 };
}

/** Test-only: clears all buckets between cases. */
export function __resetRateLimit(): void {
  buckets.clear();
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test lib/rate-limit.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/rate-limit.ts lib/rate-limit.test.ts
git commit -m "feat: in-memory fixed-window rate limiter"
```

---

## Task 7: Certificate PDF renderer

**Files:**
- Create: `lib/pdf/certificate.ts`
- Test: `lib/pdf/certificate.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/pdf/certificate.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { renderCertificatePdf } from "@/lib/pdf/certificate";

describe("renderCertificatePdf", () => {
  it("returns a non-empty PDF buffer", async () => {
    const buf = await renderCertificatePdf({
      attendeeName: "Jane Hygienist",
      courseTitle: "Infection Control Essentials",
      courseIdNumber: "ACE-2026-00042",
      certificateId: "11111111-1111-1111-1111-111111111111",
      ceHours: 2,
      completedAt: new Date("2026-06-02T12:00:00Z"),
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    // PDF magic header
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test lib/pdf/certificate.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement the renderer**

`lib/pdf/certificate.ts`:
```ts
import "server-only";
import PDFDocument from "pdfkit";

/*
  PDFKit-rendered completion certificate (landscape). Mirrors the approval
  letter renderer (lib/pdf/approval-letter.ts) for brand consistency: navy +
  gold, no em dashes, system/PDFKit fonts only. Visual reference is
  ACE_Certificate.pdf; this is the PDFKit interpretation, not an exact mirror
  (intentional deviation from SOW §10 — no headless Chromium).
*/

export type CertificateInput = {
  attendeeName: string;
  courseTitle: string;
  courseIdNumber: string;
  certificateId: string;
  ceHours: number;
  completedAt: Date;
};

export async function renderCertificatePdf(
  input: CertificateInput,
): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "LETTER", layout: "landscape", margin: 0 });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const NAVY = "#0B1A2E";
      const GOLD = "#C8971A";
      const TEXT_MID = "#344E6E";
      const TEXT_MUTED = "#6B87A8";
      const W = doc.page.width;
      const H = doc.page.height;

      // Gold border frame
      doc.rect(24, 24, W - 48, H - 48).lineWidth(3).strokeColor(GOLD).stroke();
      doc.rect(32, 32, W - 64, H - 64).lineWidth(1).strokeColor(NAVY).stroke();

      // Header brand
      doc
        .fillColor(NAVY)
        .font("Times-Bold")
        .fontSize(30)
        .text("Dental ", 0, 70, { align: "center", continued: true })
        .fillColor(GOLD)
        .text("ACE");
      doc
        .fillColor(TEXT_MUTED)
        .font("Helvetica")
        .fontSize(11)
        .text("AADB Accredited Continuing Education Program", { align: "center" });

      doc
        .fillColor(NAVY)
        .font("Times-Bold")
        .fontSize(20)
        .text("Certificate of Completion", 0, 150, { align: "center" });

      doc
        .fillColor(TEXT_MID)
        .font("Helvetica")
        .fontSize(12)
        .text("This certifies that", 0, 195, { align: "center" });

      doc
        .fillColor(NAVY)
        .font("Times-Bold")
        .fontSize(26)
        .text(input.attendeeName, 0, 218, { align: "center" });

      doc
        .fillColor(TEXT_MID)
        .font("Helvetica")
        .fontSize(12)
        .text("has successfully completed the accredited course", 0, 258, { align: "center" });

      doc
        .fillColor(NAVY)
        .font("Times-Bold")
        .fontSize(16)
        .text(input.courseTitle, 72, 282, { align: "center", width: W - 144 });

      doc
        .fillColor(TEXT_MID)
        .font("Helvetica")
        .fontSize(12)
        .text(
          `${input.ceHours.toFixed(1)} CE hours · Completed ${formatDate(input.completedAt)}`,
          0,
          322,
          { align: "center" },
        );

      // Footer ids
      doc
        .fillColor(TEXT_MUTED)
        .font("Helvetica")
        .fontSize(10)
        .text(`Course ID: ${input.courseIdNumber}`, 56, H - 70, { align: "left" });
      doc
        .fillColor(TEXT_MUTED)
        .font("Helvetica")
        .fontSize(10)
        .text(`Certificate ID: ${input.certificateId}`, 0, H - 70, {
          align: "right",
          width: W - 56,
        });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test lib/pdf/certificate.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add lib/pdf/certificate.ts lib/pdf/certificate.test.ts
git commit -m "feat(pdf): PDFKit completion-certificate renderer"
```

---

## Task 8: Certificate-issued email template

**Files:**
- Create: `emails/certificate-issued.tsx`

- [ ] **Step 1: Implement the template**

`emails/certificate-issued.tsx`:
```tsx
import { Text } from "@react-email/components";
import { BrandEmail, DetailGrid, CtaButton, emailColors } from "./_brand";

/*
  Certificate-issued email sent to the attendee. The cert PDF is attached at
  send time by lib/email/send.ts; this template refers to it. Send-only —
  there is no in-app email preview tab.
*/

export type CertificateIssuedProps = {
  attendeeName: string;
  courseTitle: string;
  courseIdNumber: string;
  certificateId: string;
  ceHours: number;
  completedAt: string;
  verifyUrl: string;
};

export default function CertificateIssuedEmail({
  attendeeName,
  courseTitle,
  courseIdNumber,
  certificateId,
  ceHours,
  completedAt,
  verifyUrl,
}: CertificateIssuedProps) {
  return (
    <BrandEmail
      preview={`Your certificate for ${courseTitle}`}
      subject="🎓 Your CE Certificate"
    >
      <Text style={{ margin: 0, fontSize: 14, color: emailColors.navy }}>
        Congratulations {attendeeName},
      </Text>
      <Text
        style={{
          margin: "10px 0 14px 0",
          fontSize: 14,
          lineHeight: 1.65,
          color: emailColors.textMid,
        }}
      >
        You passed the course quiz and earned your continuing-education
        certificate. Your certificate PDF is attached to this email.
      </Text>
      <DetailGrid
        rows={[
          { label: "Course Title", value: courseTitle },
          { label: "CE Hours", value: `${ceHours.toFixed(1)} hours` },
          { label: "Completed", value: completedAt },
          { label: "Course ID", value: courseIdNumber },
          { label: "Certificate ID", value: certificateId },
        ]}
      />
      <CtaButton href={verifyUrl} label="View course details →" />
    </BrandEmail>
  );
}

CertificateIssuedEmail.subject = ({ courseTitle }: CertificateIssuedProps) =>
  `Your CE Certificate: ${courseTitle} · DentalACE`;
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add emails/certificate-issued.tsx
git commit -m "feat(email): certificate-issued template"
```

---

## Task 9: Attendee submission schema

**Files:**
- Create: `lib/attend/schemas.ts`
- Test: `lib/attend/schemas.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/attend/schemas.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { attendeeSubmissionSchema } from "@/lib/attend/schemas";

const valid = {
  token: "11111111-1111-1111-1111-111111111111",
  attendeeName: "Jane Hygienist",
  attendeeEmail: "jane@example.com",
  licenseNumber: "TX-RDH-1",
  licenseType: "RDH",
  licenseStates: ["TX"],
  affirmed: true,
  answers: [
    { type: "TF", answer: "True" },
    { type: "TF", answer: "False" },
    { type: "MC", answer: 1 },
    { type: "MC", answer: 2 },
    { type: "MC", answer: 3 },
  ],
};

describe("attendeeSubmissionSchema", () => {
  it("accepts a valid submission", () => {
    expect(attendeeSubmissionSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects when attendance is not affirmed", () => {
    expect(attendeeSubmissionSchema.safeParse({ ...valid, affirmed: false }).success).toBe(false);
  });

  it("rejects the wrong number of answers", () => {
    expect(
      attendeeSubmissionSchema.safeParse({ ...valid, answers: valid.answers.slice(0, 4) }).success,
    ).toBe(false);
  });

  it("rejects an out-of-range MC answer", () => {
    const answers = [...valid.answers];
    answers[2] = { type: "MC", answer: 9 };
    expect(attendeeSubmissionSchema.safeParse({ ...valid, answers }).success).toBe(false);
  });

  it("rejects a non-email", () => {
    expect(attendeeSubmissionSchema.safeParse({ ...valid, attendeeEmail: "nope" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test lib/attend/schemas.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement the schema**

`lib/attend/schemas.ts`:
```ts
import { z } from "zod";

/*
  Attendee submission boundary. Validated server-side in submitAttendance.
  Identity is self-reported (no login); the token gates access to the course.
*/

export const attendeeAnswerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("TF"), answer: z.enum(["True", "False"]) }),
  z.object({ type: z.literal("MC"), answer: z.number().int().min(0).max(3) }),
]);

export const attendeeSubmissionSchema = z.object({
  token: z.string().uuid(),
  attendeeName: z.string().min(2).max(200),
  attendeeEmail: z.string().email().max(200),
  licenseNumber: z.string().max(100).optional(),
  licenseType: z.string().max(100).optional(),
  licenseStates: z.array(z.string().length(2)).min(1).max(10),
  affirmed: z.literal(true),
  answers: z.array(attendeeAnswerSchema).length(5),
});

export type AttendeeSubmission = z.infer<typeof attendeeSubmissionSchema>;
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test lib/attend/schemas.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/attend/schemas.ts lib/attend/schemas.test.ts
git commit -m "feat(attend): zod schema for attendee submission"
```

---

## Task 10: Certificate-issuing transaction helper (balance decrement)

**Files:**
- Create: `lib/attend/issue.ts`
- Test: `lib/attend/issue.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/attend/issue.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { issueCertificateTx, CertBalanceExhaustedError } from "@/lib/attend/issue";

function fakeTx(certBalance: number) {
  return {
    company: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ certBalance }),
      update: vi.fn().mockResolvedValue({}),
    },
    accreditedCourse: { update: vi.fn().mockResolvedValue({}) },
    issuedCertificate: {
      create: vi.fn().mockResolvedValue({ id: "cert-1" }),
    },
  };
}

const baseInput = {
  courseId: "course-1",
  companyId: "company-1",
  attendeeName: "Jane",
  attendeeEmail: "jane@example.com",
  licenseNumber: "TX-1",
  licenseType: "RDH",
  licenseStates: ["TX"],
  deliveryMethod: "Online (self-study)",
  courseType: "Infection Control",
  quizResponses: [{ type: "TF", answer: "True" }],
  score: 4,
};

describe("issueCertificateTx", () => {
  it("decrements balance, bumps counters, and inserts a passed cert", async () => {
    const tx = fakeTx(5);
    // @ts-expect-error fake tx shape
    const result = await issueCertificateTx(tx, baseInput);

    expect(result).toEqual({ id: "cert-1" });
    expect(tx.company.update).toHaveBeenCalledWith({
      where: { id: "company-1" },
      data: { certBalance: { decrement: 1 }, totalCertsIssued: { increment: 1 } },
    });
    expect(tx.accreditedCourse.update).toHaveBeenCalledWith({
      where: { id: "course-1" },
      data: { certsIssuedCount: { increment: 1 } },
    });
    expect(tx.issuedCertificate.create).toHaveBeenCalledOnce();
    const createArg = tx.issuedCertificate.create.mock.calls[0][0];
    expect(createArg.data.passed).toBe(true);
    expect(createArg.data.score).toBe(4);
  });

  it("throws CertBalanceExhaustedError and never mutates when balance is 0", async () => {
    const tx = fakeTx(0);
    await expect(
      // @ts-expect-error fake tx shape
      issueCertificateTx(tx, baseInput),
    ).rejects.toBeInstanceOf(CertBalanceExhaustedError);
    expect(tx.company.update).not.toHaveBeenCalled();
    expect(tx.issuedCertificate.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test lib/attend/issue.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement the helper**

`lib/attend/issue.ts`:
```ts
import "server-only";
import type { Prisma } from "@prisma/client";

/*
  Issue a certificate inside an open transaction that ALREADY holds a
  `SELECT … FOR UPDATE` lock on the company row (the caller acquires it). The
  balance is re-checked under the lock to close the race between the page-load
  check and submit. Failed attempts do NOT go through here — they are written
  by the action with passed=false and never touch the balance.
*/

export class CertBalanceExhaustedError extends Error {
  constructor() {
    super("cert balance exhausted");
    this.name = "CertBalanceExhaustedError";
  }
}

export type IssueCertInput = {
  courseId: string;
  companyId: string;
  attendeeName: string;
  attendeeEmail: string;
  licenseNumber?: string | null;
  licenseType?: string | null;
  licenseStates: string[];
  deliveryMethod?: string | null;
  courseType?: string | null;
  quizResponses: unknown;
  score: number;
};

export async function issueCertificateTx(
  tx: Prisma.TransactionClient,
  input: IssueCertInput,
): Promise<{ id: string }> {
  const company = await tx.company.findUniqueOrThrow({
    where: { id: input.companyId },
    select: { certBalance: true },
  });
  if (company.certBalance <= 0) {
    throw new CertBalanceExhaustedError();
  }

  await tx.company.update({
    where: { id: input.companyId },
    data: { certBalance: { decrement: 1 }, totalCertsIssued: { increment: 1 } },
  });
  await tx.accreditedCourse.update({
    where: { id: input.courseId },
    data: { certsIssuedCount: { increment: 1 } },
  });

  const cert = await tx.issuedCertificate.create({
    data: {
      courseId: input.courseId,
      companyId: input.companyId,
      attendeeName: input.attendeeName,
      attendeeEmail: input.attendeeEmail,
      licenseNumber: input.licenseNumber ?? null,
      licenseType: input.licenseType ?? null,
      licenseStates: input.licenseStates,
      deliveryMethod: input.deliveryMethod ?? null,
      courseType: input.courseType ?? null,
      quizResponses: input.quizResponses as Prisma.InputJsonValue,
      score: input.score,
      passed: true,
    },
    select: { id: true },
  });
  return cert;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test lib/attend/issue.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/attend/issue.ts lib/attend/issue.test.ts
git commit -m "feat(attend): atomic certificate-issue tx helper"
```

---

## Task 11: Webhook idempotency test (existing code)

**Files:**
- Test: `lib/billing/webhook-core.test.ts` (no implementation change)

- [ ] **Step 1: Write the test**

This locks in the idempotency guarantee of the existing `handleCheckoutCompleted`. We mock `@/lib/prisma` and `@/lib/billing/catalog`.

`lib/billing/webhook-core.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const company = { findUnique: vi.fn() };
const tx = {
  billingTransaction: { create: vi.fn() },
  company: { update: vi.fn() },
  $executeRaw: vi.fn(),
};
const $transaction = vi.fn(async (cb: (t: typeof tx) => Promise<void>) => cb(tx));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: { findUnique: (...a: unknown[]) => company.findUnique(...a) },
    $transaction: (...a: unknown[]) => $transaction(...(a as [never])),
  },
}));

vi.mock("@/lib/billing/catalog", () => ({
  getSku: (id: string) =>
    id === "cert_50"
      ? { id: "cert_50", kind: "CERT_BUNDLE", amountCents: 25000, grants: { certBalance: 50 } }
      : undefined,
}));

import { handleCheckoutCompleted } from "@/lib/billing/webhook-core";

describe("handleCheckoutCompleted idempotency", () => {
  beforeEach(() => {
    company.findUnique.mockReset();
    tx.billingTransaction.create.mockReset();
    tx.company.update.mockReset();
    tx.$executeRaw.mockReset();
    $transaction.mockClear();
    company.findUnique.mockResolvedValue({ id: "company-1" });
  });

  it("applies the grant exactly once on first delivery", async () => {
    tx.billingTransaction.create.mockResolvedValue({});
    const out = await handleCheckoutCompleted({
      stripeEventId: "evt_1",
      stripePaymentId: "pi_1",
      skuId: "cert_50",
      companyId: "company-1",
    });
    expect(out).toMatchObject({ ok: true, status: "applied" });
    expect(tx.company.update).toHaveBeenCalledWith({
      where: { id: "company-1" },
      data: { certBalance: { increment: 50 } },
    });
  });

  it("does not increment on a duplicate event", async () => {
    // Simulate the unique-constraint violation on stripe_event_id.
    tx.billingTransaction.create.mockRejectedValue({
      code: "P2002",
      meta: { target: ["stripe_event_id"] },
    });
    const out = await handleCheckoutCompleted({
      stripeEventId: "evt_1",
      skuId: "cert_50",
      companyId: "company-1",
    });
    expect(out).toEqual({ ok: true, status: "duplicate" });
    expect(tx.company.update).not.toHaveBeenCalled();
  });

  it("rejects an unknown SKU before any DB work", async () => {
    const out = await handleCheckoutCompleted({
      stripeEventId: "evt_2",
      skuId: "nope",
      companyId: "company-1",
    });
    expect(out).toMatchObject({ ok: false, status: "unknown_sku" });
    expect($transaction).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it passes**

Run: `pnpm test lib/billing/webhook-core.test.ts`
Expected: PASS, 3 tests. (If a test fails because the mock shape drifts from the real module, fix the mock — do not change `webhook-core.ts`.)

- [ ] **Step 3: Commit**

```bash
git add lib/billing/webhook-core.test.ts
git commit -m "test(billing): lock in webhook idempotency behavior"
```

---

## Task 12: Attendee submit server action (orchestration)

**Files:**
- Create: `lib/attend/actions.ts`

- [ ] **Step 1: Implement the action**

`lib/attend/actions.ts`:
```ts
"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { attendeeSubmissionSchema } from "@/lib/attend/schemas";
import { scoreQuiz, type AttendeeAnswer } from "@/lib/attend/scoring";
import { decideAttempt } from "@/lib/attend/lockout";
import { issueCertificateTx, CertBalanceExhaustedError } from "@/lib/attend/issue";
import { rateLimit } from "@/lib/rate-limit";
import { renderCertificatePdf } from "@/lib/pdf/certificate";
import { uploadToStorage } from "@/lib/storage";
import { sendEmail } from "@/lib/email/send";
import CertificateIssuedEmail from "@/emails/certificate-issued";
import { quizQuestionSchema, type QuizQuestion } from "@/lib/forms/application/schemas";

/*
  Public attendee submission. Validates input, rate-limits per IP+token, scores
  the quiz server-side, enforces one-retake lockout, and on a pass issues a
  certificate inside a FOR UPDATE transaction on the company row. PDF render +
  upload + email happen AFTER the tx commits and never roll back the issued
  cert (mirrors the reviewer approve flow).
*/

const quizArraySchema = z.array(quizQuestionSchema).length(5);

export type AttendResult =
  | { status: "passed"; certificateId: string }
  | { status: "failed"; correct: boolean[]; canRetake: boolean; correctAnswers?: CorrectAnswer[] }
  | { status: "locked_out" }
  | { status: "already_certified" }
  | { status: "rate_limited"; retryAfterMs: number }
  | { status: "balance_exhausted" }
  | { status: "course_inactive" }
  | { status: "invalid" };

export type CorrectAnswer =
  | { type: "TF"; correctAnswer: "True" | "False" }
  | { type: "MC"; correctIndex: number };

function correctAnswersFor(questions: QuizQuestion[]): CorrectAnswer[] {
  return questions.map((q) =>
    q.type === "TF"
      ? { type: "TF", correctAnswer: q.correctAnswer }
      : { type: "MC", correctIndex: q.correctIndex },
  );
}

export async function submitAttendance(input: unknown): Promise<AttendResult> {
  const parsed = attendeeSubmissionSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const sub = parsed.data;
  const email = sub.attendeeEmail.toLowerCase();

  // Rate limit: 5 submissions / 10 min per IP+token.
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const limit = rateLimit(`attend:${ip}:${sub.token}`, { limit: 5, windowMs: 10 * 60 * 1000 });
  if (!limit.ok) return { status: "rate_limited", retryAfterMs: limit.retryAfterMs };

  const course = await prisma.accreditedCourse.findUnique({
    where: { attendeeLinkToken: sub.token },
    select: {
      id: true,
      companyId: true,
      courseIdNumber: true,
      expiresAt: true,
      quizQuestions: true,
      application: {
        select: { courseTitle: true, ceHours: true, courseType: true, deliveryMethod: true },
      },
    },
  });
  if (!course || course.expiresAt < new Date()) return { status: "course_inactive" };

  const quizParsed = quizArraySchema.safeParse(course.quizQuestions);
  if (!quizParsed.success) return { status: "course_inactive" };
  const questions = quizParsed.data;

  // Prior attempts for (course, lowercased email).
  const prior = await prisma.issuedCertificate.findMany({
    where: { courseId: course.id, attendeeEmail: { equals: email, mode: "insensitive" } },
    select: { passed: true },
  });
  const decision = decideAttempt({
    passedExists: prior.some((p) => p.passed),
    failedCount: prior.filter((p) => !p.passed).length,
  });
  if (decision.kind === "already_certified") return { status: "already_certified" };
  if (decision.kind === "locked_out") return { status: "locked_out" };

  const scored = scoreQuiz(questions, sub.answers as AttendeeAnswer[]);

  // FAIL path — record the attempt, never touch the balance.
  if (!scored.passed) {
    await prisma.issuedCertificate.create({
      data: {
        courseId: course.id,
        companyId: course.companyId,
        attendeeName: sub.attendeeName,
        attendeeEmail: email,
        licenseNumber: sub.licenseNumber ?? null,
        licenseType: sub.licenseType ?? null,
        licenseStates: sub.licenseStates,
        deliveryMethod: course.application.deliveryMethod,
        courseType: course.application.courseType,
        quizResponses: sub.answers,
        score: scored.score,
        passed: false,
      },
    });
    const canRetake = !decision.isFinalAttempt;
    return {
      status: "failed",
      correct: scored.correct,
      canRetake,
      correctAnswers: canRetake ? undefined : correctAnswersFor(questions),
    };
  }

  // PASS path — issue inside a FOR UPDATE transaction on the company row.
  let certificateId: string;
  try {
    certificateId = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select id from public.companies where id = ${course.companyId}::uuid for update`;
      const cert = await issueCertificateTx(tx, {
        courseId: course.id,
        companyId: course.companyId,
        attendeeName: sub.attendeeName,
        attendeeEmail: email,
        licenseNumber: sub.licenseNumber ?? null,
        licenseType: sub.licenseType ?? null,
        licenseStates: sub.licenseStates,
        deliveryMethod: course.application.deliveryMethod,
        courseType: course.application.courseType,
        quizResponses: sub.answers,
        score: scored.score,
      });
      return cert.id;
    });
  } catch (err) {
    if (err instanceof CertBalanceExhaustedError) return { status: "balance_exhausted" };
    throw err;
  }

  // Post-commit: render PDF, upload, persist URL, email. Failures are logged,
  // not fatal — the cert exists and is downloadable from the company log.
  const completedAt = new Date();
  const pdfPath = `${certificateId}.pdf`;
  try {
    const pdf = await renderCertificatePdf({
      attendeeName: sub.attendeeName,
      courseTitle: course.application.courseTitle ?? "Accredited Course",
      courseIdNumber: course.courseIdNumber,
      certificateId,
      ceHours: course.application.ceHours ?? 0,
      completedAt,
    });
    await uploadToStorage({ kind: "certs", path: pdfPath, body: pdf, contentType: "application/pdf" });
    await prisma.issuedCertificate.update({
      where: { id: certificateId },
      data: { certPdfUrl: pdfPath },
    });

    const appBase = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const emailProps = {
      attendeeName: sub.attendeeName,
      courseTitle: course.application.courseTitle ?? "Accredited Course",
      courseIdNumber: course.courseIdNumber,
      certificateId,
      ceHours: course.application.ceHours ?? 0,
      completedAt: completedAt.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
      verifyUrl: `${appBase}/attend/${sub.token}`,
    };
    await sendEmail({
      to: sub.attendeeEmail,
      subject: CertificateIssuedEmail.subject(emailProps),
      react: CertificateIssuedEmail(emailProps),
      attachments: [{ filename: `${course.courseIdNumber}-certificate.pdf`, content: pdf }],
    });
  } catch (err) {
    console.error("[submitAttendance] post-issue PDF/email failed", err);
  }

  return { status: "passed", certificateId };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: zero errors. (If `application` relation select complains, confirm `AccreditedCourse.application` exists in `prisma/schema.prisma` — it does, via `applicationId`.)

- [ ] **Step 3: Commit**

```bash
git add lib/attend/actions.ts
git commit -m "feat(attend): submitAttendance server action orchestration"
```

---

## Task 13: Attendee page + boundaries (fails closed)

**Files:**
- Create: `app/attend/[token]/page.tsx`, `app/attend/[token]/loading.tsx`, `app/attend/[token]/error.tsx`

- [ ] **Step 1: Implement the loading skeleton**

`app/attend/[token]/loading.tsx`:
```tsx
export default function Loading() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <div className="h-6 w-40 animate-pulse rounded bg-slate-200" />
      <div className="mt-6 h-48 w-full animate-pulse rounded-lg bg-slate-100" />
    </main>
  );
}
```

- [ ] **Step 2: Implement the error boundary**

`app/attend/[token]/error.tsx`:
```tsx
"use client";

export default function AttendError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-600">
        We could not load this course right now. Please try again.
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
      >
        Retry
      </button>
    </main>
  );
}
```

- [ ] **Step 3: Implement the page (fails closed)**

`app/attend/[token]/page.tsx`:
```tsx
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { quizQuestionSchema } from "@/lib/forms/application/schemas";
import { AttendeeForm } from "@/components/attend/attendee-form";

/*
  Public attendee entry. Fails closed: an invalid token, an expired course, or
  a company with no remaining cert balance shows a friendly notice and no form.
*/

export const dynamic = "force-dynamic";

const quizArraySchema = z.array(quizQuestionSchema).length(5);

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">{body}</p>
    </main>
  );
}

export default async function AttendPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const course = await prisma.accreditedCourse.findUnique({
    where: { attendeeLinkToken: token },
    select: {
      expiresAt: true,
      quizQuestions: true,
      company: { select: { certBalance: true } },
      application: { select: { courseTitle: true, ceHours: true } },
    },
  });

  if (!course) {
    return <Notice title="Course not found" body="This certificate link is not valid." />;
  }
  if (course.expiresAt < new Date()) {
    return <Notice title="Course expired" body="This course is no longer accepting certificate claims." />;
  }
  if (course.company.certBalance <= 0) {
    return (
      <Notice
        title="Certificates unavailable"
        body="The course provider has run out of certificate credits. Please contact them to continue."
      />
    );
  }

  const quiz = quizArraySchema.safeParse(course.quizQuestions);
  if (!quiz.success) {
    return <Notice title="Course unavailable" body="This course is not configured for certificates yet." />;
  }

  // Strip correct answers before sending the quiz to the client.
  const publicQuiz = quiz.data.map((q) =>
    q.type === "TF"
      ? { type: "TF" as const, question: q.question }
      : { type: "MC" as const, question: q.question, options: q.options },
  );

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-900">
        {course.application.courseTitle ?? "Claim your certificate"}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {(course.application.ceHours ?? 0).toFixed(1)} CE hours
      </p>
      <AttendeeForm token={token} quiz={publicQuiz} />
    </main>
  );
}
```

- [ ] **Step 4: Verify typecheck (will fail until Task 14 creates the form)**

Run: `pnpm typecheck`
Expected: error that `@/components/attend/attendee-form` is missing. This is resolved by Task 14. Proceed to Task 14 before committing.

- [ ] **Step 5: Commit after Task 14 (see Task 14 Step 4)**

---

## Task 14: Attendee form client component

**Files:**
- Create: `components/attend/attendee-form.tsx`

- [ ] **Step 1: Implement the 4-step form**

`components/attend/attendee-form.tsx`:
```tsx
"use client";

import { useState } from "react";
import { submitAttendance, type AttendResult } from "@/lib/attend/actions";

/*
  4-step mobile attendee form: identity → affirmation → quiz → review/submit.
  The quiz arrives WITHOUT correct answers; scoring is server-side only.
*/

export type PublicQuizQuestion =
  | { type: "TF"; question: string }
  | { type: "MC"; question: string; options: string[] };

type Answer = { type: "TF"; answer: "True" | "False" } | { type: "MC"; answer: number };

export function AttendeeForm({ token, quiz }: { token: string; quiz: PublicQuizQuestion[] }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseType, setLicenseType] = useState("");
  const [licenseState, setLicenseState] = useState("");
  const [affirmed, setAffirmed] = useState(false);
  const [answers, setAnswers] = useState<(Answer | null)[]>(quiz.map(() => null));
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AttendResult | null>(null);

  function setAnswer(i: number, a: Answer) {
    setAnswers((prev) => prev.map((x, idx) => (idx === i ? a : x)));
  }

  async function onSubmit() {
    setSubmitting(true);
    try {
      const res = await submitAttendance({
        token,
        attendeeName: name,
        attendeeEmail: email,
        licenseNumber: licenseNumber || undefined,
        licenseType: licenseType || undefined,
        licenseStates: [licenseState.toUpperCase()],
        affirmed,
        answers: answers.filter(Boolean),
      });
      setResult(res);
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return <ResultView result={result} onRetake={() => { setResult(null); setStep(2); setAnswers(quiz.map(() => null)); }} />;
  }

  const allAnswered = answers.every(Boolean);

  return (
    <div className="mt-6 space-y-4">
      {step === 0 && (
        <section className="space-y-3">
          <Field label="Full name" value={name} onChange={setName} />
          <Field label="Email" value={email} onChange={setEmail} type="email" />
          <Field label="License number" value={licenseNumber} onChange={setLicenseNumber} />
          <Field label="License type (e.g. RDH)" value={licenseType} onChange={setLicenseType} />
          <Field label="License state (2-letter)" value={licenseState} onChange={setLicenseState} />
          <NavButtons onNext={() => setStep(1)} nextDisabled={!name || !email || !licenseState} />
        </section>
      )}

      {step === 1 && (
        <section className="space-y-3">
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={affirmed} onChange={(e) => setAffirmed(e.target.checked)} className="mt-1" />
            <span>I affirm that I attended and completed this course in full.</span>
          </label>
          <NavButtons onBack={() => setStep(0)} onNext={() => setStep(2)} nextDisabled={!affirmed} />
        </section>
      )}

      {step === 2 && (
        <section className="space-y-5">
          {quiz.map((q, i) => (
            <fieldset key={i} className="space-y-2">
              <legend className="text-sm font-medium text-slate-900">{i + 1}. {q.question}</legend>
              {q.type === "TF"
                ? (["True", "False"] as const).map((opt) => (
                    <Option
                      key={opt}
                      label={opt}
                      selected={answers[i]?.type === "TF" && answers[i]?.answer === opt}
                      onSelect={() => setAnswer(i, { type: "TF", answer: opt })}
                    />
                  ))
                : q.options.map((opt, j) => (
                    <Option
                      key={j}
                      label={opt}
                      selected={answers[i]?.type === "MC" && answers[i]?.answer === j}
                      onSelect={() => setAnswer(i, { type: "MC", answer: j })}
                    />
                  ))}
            </fieldset>
          ))}
          <NavButtons onBack={() => setStep(1)} onNext={() => setStep(3)} nextDisabled={!allAnswered} />
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4">
          <p className="text-sm text-slate-700">Review and submit to claim your certificate.</p>
          <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
            <div><strong>{name}</strong></div>
            <div>{email}</div>
            <div>{licenseType} {licenseNumber} · {licenseState.toUpperCase()}</div>
          </div>
          <NavButtons
            onBack={() => setStep(2)}
            onNext={onSubmit}
            nextLabel={submitting ? "Submitting…" : "Submit"}
            nextDisabled={submitting}
          />
        </section>
      )}
    </div>
  );
}

function ResultView({ result, onRetake }: { result: AttendResult; onRetake: () => void }) {
  switch (result.status) {
    case "passed":
      return <Banner tone="ok" title="You passed!" body="Your certificate is on its way by email." />;
    case "failed":
      return (
        <div className="space-y-4">
          <Banner tone="warn" title="Not passed yet" body={result.canRetake ? "You can retake the quiz once." : "You have used all attempts for this course."} />
          {result.correctAnswers && (
            <p className="text-sm text-slate-600">The correct answers have been recorded for your records.</p>
          )}
          {result.canRetake && (
            <button onClick={onRetake} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
              Retake quiz
            </button>
          )}
        </div>
      );
    case "already_certified":
      return <Banner tone="ok" title="Already certified" body="A certificate was already issued for this email on this course." />;
    case "locked_out":
      return <Banner tone="warn" title="No attempts remaining" body="You have used all attempts for this course." />;
    case "balance_exhausted":
      return <Banner tone="warn" title="Certificates unavailable" body="The provider has run out of certificate credits." />;
    case "course_inactive":
      return <Banner tone="warn" title="Course unavailable" body="This course is no longer accepting certificate claims." />;
    case "rate_limited":
      return <Banner tone="warn" title="Too many attempts" body="Please wait a few minutes and try again." />;
    default:
      return <Banner tone="warn" title="Check your entries" body="Some details were missing or invalid." />;
  }
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block text-sm">
      <span className="text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
    </label>
  );
}

function Option({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`block w-full rounded-md border px-3 py-2 text-left text-sm ${selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"}`}
    >
      {label}
    </button>
  );
}

function NavButtons({ onBack, onNext, nextDisabled, nextLabel = "Next" }: { onBack?: () => void; onNext: () => void; nextDisabled?: boolean; nextLabel?: string }) {
  return (
    <div className="flex justify-between pt-2">
      {onBack ? (
        <button type="button" onClick={onBack} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700">Back</button>
      ) : <span />}
      <button type="button" onClick={onNext} disabled={nextDisabled} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
        {nextLabel}
      </button>
    </div>
  );
}

function Banner({ tone, title, body }: { tone: "ok" | "warn"; title: string; body: string }) {
  return (
    <div className={`mt-6 rounded-lg border p-4 ${tone === "ok" ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-700">{body}</p>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: zero errors (the page from Task 13 now resolves).

- [ ] **Step 3: Verify the build compiles the new route**

Run: `pnpm build`
Expected: build succeeds; `/attend/[token]` appears in the route list.

- [ ] **Step 4: Commit Tasks 13 + 14 together**

```bash
git add app/attend components/attend/attendee-form.tsx
git commit -m "feat(attend): public attendee page + 4-step form"
```

---

## Task 15: Company certificate log — real list, search, signed downloads

**Files:**
- Modify: `app/company/certificates/page.tsx` (full rewrite)

- [ ] **Step 1: Rewrite the page**

`app/company/certificates/page.tsx`:
```tsx
import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createSignedUrl } from "@/lib/storage";
import { Prisma } from "@prisma/client";

/*
  Certificate Log — real listing of issued (passed) certificates for the
  company, searchable by attendee name/email, paginated, with short-lived
  signed-URL PDF downloads. Failed quiz attempts (passed=false) are excluded.
*/

const PAGE_SIZE = 25;

export default async function CertificateLogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const user = await requireDentalAce();
  const { q, page } = await searchParams;
  const pageNum = Math.max(1, Number(page ?? "1") || 1);
  const query = (q ?? "").trim();

  const where: Prisma.IssuedCertificateWhereInput = {
    companyId: user.companyId ?? "",
    passed: true,
    ...(query
      ? {
          OR: [
            { attendeeName: { contains: query, mode: "insensitive" } },
            { attendeeEmail: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, certs] = await Promise.all([
    prisma.issuedCertificate.count({ where }),
    prisma.issuedCertificate.findMany({
      where,
      orderBy: { issuedAt: "desc" },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const rows = await Promise.all(
    certs.map(async (cert) => ({
      cert,
      downloadUrl: cert.certPdfUrl
        ? await createSignedUrl("certs", cert.certPdfUrl).catch(() => null)
        : null,
    })),
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Certificate Log"
        subtitle={`${total} certificate${total === 1 ? "" : "s"} issued`}
      />

      <form className="mb-4" action="/company/certificates" method="get">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search attendee name or email"
          className="w-full max-w-sm rounded-md border border-border px-3 py-2 text-[13px]"
        />
      </form>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12px] text-text-muted">
            {query ? "No certificates match your search." : "No certificates issued yet."}
          </p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2 font-semibold">Issued</th>
                <th className="px-4 py-2 font-semibold">Attendee</th>
                <th className="px-4 py-2 font-semibold">Email</th>
                <th className="px-4 py-2 font-semibold">License</th>
                <th className="px-4 py-2 font-semibold">Certificate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ cert, downloadUrl }) => (
                <tr key={cert.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2 text-text-muted">
                    {cert.issuedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                  <td className="px-4 py-2 font-medium text-navy">{cert.attendeeName}</td>
                  <td className="px-4 py-2 text-text-mid">{cert.attendeeEmail}</td>
                  <td className="px-4 py-2 text-text-muted">
                    {cert.licenseType ?? ""} {cert.licenseNumber ?? ""}
                  </td>
                  <td className="px-4 py-2">
                    {downloadUrl ? (
                      <a href={downloadUrl} className="text-ace underline" target="_blank" rel="noopener noreferrer">
                        Download PDF
                      </a>
                    ) : (
                      <span className="text-text-muted">Processing</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-[12px] text-text-muted">
          <span>Page {pageNum} of {totalPages}</span>
          <div className="flex gap-2">
            {pageNum > 1 && (
              <Link className="rounded-md border border-border px-3 py-1" href={`/company/certificates?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(pageNum - 1) })}`}>
                Previous
              </Link>
            )}
            {pageNum < totalPages && (
              <Link className="rounded-md border border-border px-3 py-1" href={`/company/certificates?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(pageNum + 1) })}`}>
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: zero errors. (If `text-ace` is not a known class, use `text-navy` instead — confirm against `app/globals.css` tokens.)

- [ ] **Step 3: Commit**

```bash
git add app/company/certificates/page.tsx
git commit -m "feat(company): real certificate log with search + signed downloads"
```

---

## Task 16: Env documentation + final verification

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Ensure the Resend/admin vars are documented**

Confirm `.env.example` contains (uncommented contract lines under a Resend section). Add any that are missing:
```bash
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@dentalace.org
AADB_ADMIN_EMAIL=
REVIEWER_NOTIFICATION_EMAILS=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 2: Confirm local env is set for real sends**

This is an operational check, not a code change. Verify `.env.local` has `RESEND_API_KEY` (already present), `RESEND_FROM_EMAIL`, and `NEXT_PUBLIC_APP_URL` set. Note for the operator: without `RESEND_FROM_EMAIL` the helper falls back to `noreply@dentalace.org`; without `NEXT_PUBLIC_APP_URL` attendee links and the cert email default to `http://localhost:3000`.

Run (verification only):
```bash
grep -E "RESEND_FROM_EMAIL|NEXT_PUBLIC_APP_URL" .env.local || echo "MISSING — set before issuing real certs"
```

- [ ] **Step 3: No nav change — confirm there is no email-preview tab**

Per the spec, email templates stay send-only. Confirm `lib/nav/portal-nav.ts` has no "Emails" item (it does not today). No edit required.

- [ ] **Step 4: Full suite + typecheck + build**

Run:
```bash
pnpm test && pnpm typecheck && pnpm build
```
Expected: all tests pass; zero type errors; build succeeds with `/attend/[token]` listed.

- [ ] **Step 5: Commit**

```bash
git add .env.example
git commit -m "docs(env): document Resend + app-url vars for the cert loop"
```

---

## Self-Review (completed during authoring)

- **Spec coverage:** attendee page + 4-step form (Tasks 13–14), server-side quiz scoring (Task 2), one-retake lockout + correct-answer reveal (Tasks 3, 12, 14), atomic `cert_balance` decrement under FOR UPDATE (Tasks 10, 12), fail-closed on expiry/exhausted/bad-token (Tasks 12–13), certificate PDF via PDFKit (Task 7), `certificate-issued` email (Task 8), `issued_certificates` write incl. failed attempts (Tasks 10, 12), cert log with search + pagination + signed URLs (Task 15), rate limiting on the attendee action (Tasks 6, 12), Vitest harness + critical-path tests incl. webhook idempotency & credit consumption & Course-ID generator (Tasks 1, 2–6, 10–11), env documentation (Task 16). All M1 spec bullets map to a task.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code.
- **Type consistency:** `AttendeeAnswer` (scoring) is reused by the action and form; `AttendResult` defined in Task 12 is imported by Task 14; `issueCertificateTx`/`CertBalanceExhaustedError` names match between Tasks 10 and 12; `scoreQuiz`/`decideAttempt`/`chooseCreditPool`/`formatCourseId`/`nextSeqFromLast`/`rateLimit` signatures are consistent across definition and call sites.
- **Out of scope (M2/M3):** low-balance/expiry crons + their 4 emails + `notification_log`, admin override tooling, state-board dashboard, ACE badge PNG, login/app-submit rate limiting, cert-bundle tier reconciliation.
