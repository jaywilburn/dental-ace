# Dental ACE M2 — Lifecycle Emails + Crons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the daily lifecycle notifications for Dental ACE — course-expiry (60d/30d), app-credit-expiry (30d), low cert balance, and exhausted cert balance — via one consolidated Vercel cron, four React Email templates, a `notification_log` dedupe/cooldown store, and a dashboard copy fix.

**Architecture:** Pure, unit-tested decision logic (`lib/notifications/lifecycle.ts`) is wired by a single daily cron route (`app/api/cron/dental-ace-lifecycle/route.ts`) that mirrors the existing `app/api/cron/protrack-reminders/route.ts` (CRON_SECRET bearer auth, send-once via a log table with a unique constraint). Send-once kinds (expiry) dedupe on an expiry-date `periodKey`; cooldown kinds (balance) check the most recent send against a 7-day window. The two balance alerts are mutually exclusive per company per run.

**Tech Stack:** Next.js 16 route handler, Prisma 7 (new `NotificationLog` model + migration), Supabase RLS (raw-SQL migration), React Email + Resend, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-03-dentalace-m2-lifecycle-emails-crons-design.md`.

---

## File Structure

**New — pure logic + tests:**
- `lib/notifications/lifecycle.ts` — `daysUntil`, `dueCourseReminders`, `creditsReminderDue`, `balanceAlertKind`, `isCooldownElapsed`.
- `lib/notifications/lifecycle.test.ts`.

**New — email templates (mirror `emails/application-approved.tsx`):**
- `emails/course-expiring.tsx`, `emails/app-credits-expiring.tsx`, `emails/low-cert-balance.tsx`, `emails/cert-balance-exhausted.tsx`.

**New — DB:**
- `prisma/schema.prisma` — add `NotificationLog` model (Modify).
- Prisma migration (generated): `prisma/migrations/<ts>_0007_notification_log/`.
- `sql-migrations/0010_notification_log_rls.sql` — RLS (apply via Supabase MCP).

**New — cron:**
- `app/api/cron/dental-ace-lifecycle/route.ts`.

**Modified:**
- `app/company/page.tsx` — widget copy fix (one string).
- `vercel.json` — add one cron entry.

---

## Task 1: Pure lifecycle logic

**Files:**
- Create: `lib/notifications/lifecycle.ts`
- Test: `lib/notifications/lifecycle.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/notifications/lifecycle.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  daysUntil,
  dueCourseReminders,
  creditsReminderDue,
  balanceAlertKind,
  isCooldownElapsed,
} from "@/lib/notifications/lifecycle";

const now = new Date("2026-06-03T00:00:00Z");
const inDays = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

describe("daysUntil", () => {
  it("counts whole days ahead (ceil)", () => {
    expect(daysUntil(inDays(30), now)).toBe(30);
    expect(daysUntil(new Date(now.getTime() + 1000), now)).toBe(1);
    expect(daysUntil(now, now)).toBe(0);
  });
});

describe("dueCourseReminders", () => {
  it("returns nothing beyond 60 days", () => {
    expect(dueCourseReminders(61)).toEqual([]);
  });
  it("returns d60 between 31 and 60 inclusive", () => {
    expect(dueCourseReminders(60)).toEqual(["d60"]);
    expect(dueCourseReminders(31)).toEqual(["d60"]);
  });
  it("returns both d60 and d30 at 30 or fewer days", () => {
    expect(dueCourseReminders(30)).toEqual(["d60", "d30"]);
    expect(dueCourseReminders(1)).toEqual(["d60", "d30"]);
  });
});

describe("creditsReminderDue", () => {
  it("is true within 30 days with credits remaining", () => {
    expect(creditsReminderDue(30, 3)).toBe(true);
    expect(creditsReminderDue(1, 1)).toBe(true);
  });
  it("is false past 30 days, at/under 0 days, or with no credits", () => {
    expect(creditsReminderDue(31, 3)).toBe(false);
    expect(creditsReminderDue(0, 3)).toBe(false);
    expect(creditsReminderDue(10, 0)).toBe(false);
  });
});

describe("balanceAlertKind", () => {
  it("returns exhausted at zero", () => {
    expect(balanceAlertKind(0, 25)).toBe("exhausted");
  });
  it("returns low at or below threshold but above zero", () => {
    expect(balanceAlertKind(25, 25)).toBe("low");
    expect(balanceAlertKind(1, 25)).toBe("low");
  });
  it("returns null above threshold", () => {
    expect(balanceAlertKind(26, 25)).toBe(null);
  });
});

describe("isCooldownElapsed", () => {
  it("is true when never sent", () => {
    expect(isCooldownElapsed(null, now, 7)).toBe(true);
  });
  it("is false within the window", () => {
    expect(isCooldownElapsed(inDays(-6), now, 7)).toBe(false);
  });
  it("is true at or beyond the window", () => {
    expect(isCooldownElapsed(inDays(-7), now, 7)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test lib/notifications/lifecycle.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement**

`lib/notifications/lifecycle.ts`:
```ts
/*
  Pure decision logic for the Dental ACE lifecycle cron. No DB, no server-only —
  unit-tested directly. The cron wires these to Prisma + the notification_log
  dedupe store.
*/

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `now` until `date`, rounded up. Past dates go negative. */
export function daysUntil(date: Date, now: Date): number {
  return Math.ceil((date.getTime() - now.getTime()) / DAY_MS);
}

/** Which course-expiry thresholds apply. d60 at <=60 days; d30 also at <=30. */
export function dueCourseReminders(days: number): ("d60" | "d30")[] {
  if (days > 60) return [];
  if (days > 30) return ["d60"];
  return ["d60", "d30"];
}

/** App credits get a single 30-day reminder while some remain and not yet expired. */
export function creditsReminderDue(days: number, creditsRemaining: number): boolean {
  return creditsRemaining > 0 && days > 0 && days <= 30;
}

/** Mutually-exclusive cert-balance alert classification. */
export function balanceAlertKind(
  certBalance: number,
  threshold: number,
): "exhausted" | "low" | null {
  if (certBalance <= 0) return "exhausted";
  if (certBalance <= threshold) return "low";
  return null;
}

/** Rolling cooldown: true if never sent or the last send is at least cooldownDays old. */
export function isCooldownElapsed(
  lastSentAt: Date | null,
  now: Date,
  cooldownDays: number,
): boolean {
  if (!lastSentAt) return true;
  return now.getTime() - lastSentAt.getTime() >= cooldownDays * DAY_MS;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test lib/notifications/lifecycle.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/lifecycle.ts lib/notifications/lifecycle.test.ts
git commit -m "feat(notifications): pure lifecycle decision logic"
```

---

## Task 2: Email templates

**Files:**
- Create: `emails/course-expiring.tsx`, `emails/app-credits-expiring.tsx`, `emails/low-cert-balance.tsx`, `emails/cert-balance-exhausted.tsx`

Context: each mirrors `emails/application-approved.tsx` — imports `{ BrandEmail, DetailGrid, CtaButton, emailColors } from "./_brand"`, returns `<BrandEmail preview subject>...</BrandEmail>`, and attaches a static `.subject(props)`. No em dashes in copy. `BrandEmail` defaults to `product="ace"`.

- [ ] **Step 1: Create `emails/course-expiring.tsx`**

```tsx
import { Text } from "@react-email/components";
import { BrandEmail, DetailGrid, CtaButton, emailColors } from "./_brand";

/*
  Course-expiring reminder sent to the company at 60 and 30 days before an
  accredited course's expiry. Send-only; no in-app preview tab.
*/

export type CourseExpiringProps = {
  companyName: string;
  courseTitle: string;
  courseIdNumber: string;
  expiresAt: string;
  daysRemaining: number;
  myCoursesUrl: string;
};

export default function CourseExpiringEmail({
  companyName,
  courseTitle,
  courseIdNumber,
  expiresAt,
  daysRemaining,
  myCoursesUrl,
}: CourseExpiringProps) {
  return (
    <BrandEmail
      preview={`${courseTitle} expires in ${daysRemaining} days`}
      subject="Course accreditation expiring"
    >
      <Text style={{ margin: 0, fontSize: 14, color: emailColors.navy }}>
        Dear {companyName},
      </Text>
      <Text style={{ margin: "10px 0 14px 0", fontSize: 14, lineHeight: 1.65, color: emailColors.textMid }}>
        Your accredited course is approaching its expiration date. After it
        expires, attendees can no longer claim certificates for it. To keep it
        active, contact AADB to renew before the date below.
      </Text>
      <DetailGrid
        rows={[
          { label: "Course Title", value: courseTitle },
          { label: "Course ID", value: courseIdNumber },
          { label: "Expires", value: expiresAt },
          { label: "Days Remaining", value: String(daysRemaining) },
        ]}
      />
      <CtaButton href={myCoursesUrl} label="View My Courses →" />
    </BrandEmail>
  );
}

CourseExpiringEmail.subject = ({ courseTitle, daysRemaining }: CourseExpiringProps) =>
  `${courseTitle} expires in ${daysRemaining} days · DentalACE`;
```

- [ ] **Step 2: Create `emails/app-credits-expiring.tsx`**

```tsx
import { Text } from "@react-email/components";
import { BrandEmail, DetailGrid, CtaButton, emailColors } from "./_brand";

/*
  App-credits-expiring reminder, sent to the company ~30 days before unused
  application credits expire. Send-only.
*/

export type AppCreditsExpiringProps = {
  companyName: string;
  creditsRemaining: number;
  expiresAt: string;
  buyCreditsUrl: string;
};

export default function AppCreditsExpiringEmail({
  companyName,
  creditsRemaining,
  expiresAt,
  buyCreditsUrl,
}: AppCreditsExpiringProps) {
  return (
    <BrandEmail
      preview={`${creditsRemaining} application credits expiring soon`}
      subject="Application credits expiring"
    >
      <Text style={{ margin: 0, fontSize: 14, color: emailColors.navy }}>
        Dear {companyName},
      </Text>
      <Text style={{ margin: "10px 0 14px 0", fontSize: 14, lineHeight: 1.65, color: emailColors.textMid }}>
        Some of your application credits will expire soon. Use them to submit a
        course application before they lapse.
      </Text>
      <DetailGrid
        rows={[
          { label: "Credits Remaining", value: String(creditsRemaining) },
          { label: "Expire On", value: expiresAt },
        ]}
      />
      <CtaButton href={buyCreditsUrl} label="Manage Credits →" />
    </BrandEmail>
  );
}

AppCreditsExpiringEmail.subject = ({ creditsRemaining }: AppCreditsExpiringProps) =>
  `${creditsRemaining} application credits expiring soon · DentalACE`;
```

- [ ] **Step 3: Create `emails/low-cert-balance.tsx`**

```tsx
import { Text } from "@react-email/components";
import { BrandEmail, DetailGrid, CtaButton, emailColors } from "./_brand";

/*
  Low-cert-balance alert, sent to the company when cert_balance falls to or
  below cert_alert_threshold. Rolling 7-day cooldown enforced by the cron.
*/

export type LowCertBalanceProps = {
  companyName: string;
  certBalance: number;
  threshold: number;
  buyCertsUrl: string;
};

export default function LowCertBalanceEmail({
  companyName,
  certBalance,
  threshold,
  buyCertsUrl,
}: LowCertBalanceProps) {
  return (
    <BrandEmail
      preview={`Certificate balance low (${certBalance} left)`}
      subject="Certificate balance running low"
    >
      <Text style={{ margin: 0, fontSize: 14, color: emailColors.navy }}>
        Dear {companyName},
      </Text>
      <Text style={{ margin: "10px 0 14px 0", fontSize: 14, lineHeight: 1.65, color: emailColors.textMid }}>
        Your certificate balance is running low. When it reaches zero, attendees
        cannot claim certificates for your courses. Top up to avoid interruption.
      </Text>
      <DetailGrid
        rows={[
          { label: "Certificates Remaining", value: String(certBalance) },
          { label: "Alert Threshold", value: String(threshold) },
        ]}
      />
      <CtaButton href={buyCertsUrl} label="Buy Certificates →" />
    </BrandEmail>
  );
}

LowCertBalanceEmail.subject = ({ certBalance }: LowCertBalanceProps) =>
  `Certificate balance low (${certBalance} left) · DentalACE`;
```

- [ ] **Step 4: Create `emails/cert-balance-exhausted.tsx`**

```tsx
import { Text } from "@react-email/components";
import { BrandEmail, CtaButton, emailColors } from "./_brand";

/*
  Cert-balance-exhausted alert, sent to the company AND AADB_ADMIN_EMAIL when
  cert_balance hits zero. Rolling 7-day cooldown enforced by the cron.
*/

export type CertBalanceExhaustedProps = {
  companyName: string;
  buyCertsUrl: string;
};

export default function CertBalanceExhaustedEmail({
  companyName,
  buyCertsUrl,
}: CertBalanceExhaustedProps) {
  return (
    <BrandEmail
      preview="Certificate balance depleted"
      subject="Certificate balance depleted"
    >
      <Text style={{ margin: 0, fontSize: 14, color: emailColors.navy }}>
        Dear {companyName},
      </Text>
      <Text style={{ margin: "10px 0 14px 0", fontSize: 14, lineHeight: 1.65, color: emailColors.textMid }}>
        Your certificate balance has reached zero. Attendees can no longer claim
        certificates for your accredited courses until you add more. Purchase a
        certificate bundle to resume issuing right away.
      </Text>
      <CtaButton href={buyCertsUrl} label="Buy Certificates →" />
    </BrandEmail>
  );
}

CertBalanceExhaustedEmail.subject = ({ companyName }: CertBalanceExhaustedProps) =>
  `Certificate balance depleted for ${companyName} · DentalACE`;
```

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck`
Expected: zero errors.
```bash
git add emails/course-expiring.tsx emails/app-credits-expiring.tsx emails/low-cert-balance.tsx emails/cert-balance-exhausted.tsx
git commit -m "feat(email): lifecycle templates (course/credit expiry, low/exhausted balance)"
```

---

## Task 3: `notification_log` model + migrations

> **DB-touching task.** `prisma migrate dev` applies to the configured database (live Supabase per project setup). The controller may run this step directly rather than delegate. Confirm the current highest migration number first.

**Files:**
- Modify: `prisma/schema.prisma`
- Generated: `prisma/migrations/<timestamp>_0007_notification_log/`
- Create: `sql-migrations/0010_notification_log_rls.sql`

- [ ] **Step 1: Confirm migration numbers**

Run: `ls prisma/migrations | sort | tail -3 && ls sql-migrations | sort | tail -1`
Expected: highest Prisma number is `0006`, highest sql-migration is `0009`. So use `0007` (Prisma) and `0010` (sql). If the Verify stream has since added higher numbers, use the next available and adjust the filenames below accordingly.

- [ ] **Step 2: Add the model to `prisma/schema.prisma`**

Append this model (place it near the other log/model definitions, e.g. after `ProtrackReminderLog`):
```prisma
model NotificationLog {
  id        String   @id @default(uuid()) @db.Uuid
  companyId String   @map("company_id") @db.Uuid
  kind      String // course_expiring_60 | course_expiring_30 | credits_expiring_30 | low_balance | balance_exhausted
  refId     String   @map("ref_id") @db.Uuid // courseId for course_* kinds; companyId for company-level kinds
  periodKey String   @map("period_key") // dedupe bucket: expiry date (send-once) or send date (cooldown)
  sentAt    DateTime @default(now()) @map("sent_at")

  @@unique([companyId, kind, refId, periodKey])
  @@index([companyId, kind, sentAt])
  @@map("notification_log")
}
```

- [ ] **Step 3: Generate + apply the Prisma migration**

Run: `pnpm exec prisma migrate dev --name 0007_notification_log`
Expected: a new migration folder is created and applied; `prisma generate` runs so `prisma.notificationLog` is available on the client.

- [ ] **Step 4: Create the RLS migration `sql-migrations/0010_notification_log_rls.sql`**

Mirrors `protrack_reminder_log` in `sql-migrations/0007_phase2_protrack_rls.sql` (written by the cron via service-role; ADMIN may read):
```sql
-- 0010_notification_log_rls.sql
-- RLS for notification_log. Written by the dental-ace-lifecycle cron via the
-- service-role client (bypasses RLS). No customer/anon access; ADMIN may read.
-- Apply via the Supabase MCP apply_migration tool.

alter table public.notification_log enable row level security;

create policy "notification_log_admin_all"
on public.notification_log for all
to authenticated
using (public.current_user_role() = 'ADMIN')
with check (public.current_user_role() = 'ADMIN');
```

- [ ] **Step 5: Apply the RLS migration**

Apply `sql-migrations/0010_notification_log_rls.sql` via the Supabase MCP `apply_migration` tool (migration name `notification_log_rls`). (Raw-SQL RLS migrations are not managed by Prisma.) If MCP is unavailable to the implementer, report DONE_WITH_CONCERNS noting the RLS file is created but not yet applied, so the controller can apply it.

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm typecheck`
Expected: zero errors (the `NotificationLog` model resolves on the Prisma client).
```bash
git add prisma/schema.prisma prisma/migrations sql-migrations/0010_notification_log_rls.sql
git commit -m "feat(db): notification_log table + RLS for lifecycle dedupe"
```

---

## Task 4: The lifecycle cron route

**Files:**
- Create: `app/api/cron/dental-ace-lifecycle/route.ts`

Context: mirrors `app/api/cron/protrack-reminders/route.ts` (read it for the auth + send-once pattern). Not unit-tested (DB-dependent), consistent with that cron.

- [ ] **Step 1: Implement the route**

`app/api/cron/dental-ace-lifecycle/route.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import CourseExpiringEmail from "@/emails/course-expiring";
import AppCreditsExpiringEmail from "@/emails/app-credits-expiring";
import LowCertBalanceEmail from "@/emails/low-cert-balance";
import CertBalanceExhaustedEmail from "@/emails/cert-balance-exhausted";
import {
  daysUntil,
  dueCourseReminders,
  creditsReminderDue,
  balanceAlertKind,
  isCooldownElapsed,
} from "@/lib/notifications/lifecycle";

/*
  Daily Dental ACE lifecycle cron (Vercel Cron -> vercel.json). One pass:
   - course-expiry reminders at 60 and 30 days (send-once per course+threshold)
   - app-credit-expiry reminder at <=30 days (send-once per credit window)
   - cert-balance alerts: exhausted (==0) or low (<=threshold), rolling 7-day
     cooldown, mutually exclusive.

  Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Reject any
  mismatch; with no secret set, allow only outside production (dev convenience).
  Dedupe is enforced by inserting into notification_log first and only emailing
  when the insert is new (send-once) or the cooldown has elapsed.
*/

export const runtime = "nodejs";

const COOLDOWN_DAYS = 7;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (secret) return provided === secret;
  return process.env.NODE_ENV !== "production";
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** Send-once: insert the key; email only when the row is newly created. */
async function sendOnce(
  key: { companyId: string; kind: string; refId: string; periodKey: string },
  send: () => Promise<void>,
): Promise<boolean> {
  const inserted = await prisma.notificationLog.createMany({ data: [key], skipDuplicates: true });
  if (inserted.count !== 1) return false;
  await send();
  return true;
}

/** Cooldown: send only if the last send for (company,kind) is >= COOLDOWN_DAYS old. */
async function sendWithCooldown(
  companyId: string,
  kind: string,
  now: Date,
  send: () => Promise<void>,
): Promise<boolean> {
  const last = await prisma.notificationLog.findFirst({
    where: { companyId, kind },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true },
  });
  if (!isCooldownElapsed(last?.sentAt ?? null, now, COOLDOWN_DAYS)) return false;
  const inserted = await prisma.notificationLog.createMany({
    data: [{ companyId, kind, refId: companyId, periodKey: isoDate(now) }],
    skipDuplicates: true,
  });
  if (inserted.count !== 1) return false;
  await send();
  return true;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const now = new Date();
  let coursesReminded = 0;
  let creditsReminded = 0;
  let lowBalance = 0;
  let exhausted = 0;

  // 1) Course-expiry reminders.
  const courses = await prisma.accreditedCourse.findMany({
    where: { expiresAt: { gt: now } },
    select: {
      id: true,
      companyId: true,
      courseIdNumber: true,
      expiresAt: true,
      application: { select: { courseTitle: true } },
      company: { select: { name: true, users: { select: { email: true } } } },
    },
  });

  for (const course of courses) {
    const recipients = course.company.users.map((u) => u.email);
    if (recipients.length === 0) continue;
    const days = daysUntil(course.expiresAt, now);
    for (const t of dueCourseReminders(days)) {
      const kind = t === "d60" ? "course_expiring_60" : "course_expiring_30";
      const daysRemaining = t === "d60" ? 60 : 30;
      const props = {
        companyName: course.company.name,
        courseTitle: course.application.courseTitle ?? "your course",
        courseIdNumber: course.courseIdNumber,
        expiresAt: fmtDate(course.expiresAt),
        daysRemaining,
        myCoursesUrl: `${origin}/company/courses`,
      };
      const sent = await sendOnce(
        { companyId: course.companyId, kind, refId: course.id, periodKey: isoDate(course.expiresAt) },
        () => sendEmail({ to: recipients, subject: CourseExpiringEmail.subject(props), react: CourseExpiringEmail(props) }),
      );
      if (sent) coursesReminded++;
    }
  }

  // 2) Per-company: app-credit expiry + balance alerts.
  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      applicationCredits: true,
      applicationCreditsExpiresAt: true,
      certBalance: true,
      certAlertThreshold: true,
      users: { select: { email: true } },
    },
  });
  const adminEmail = process.env.AADB_ADMIN_EMAIL;

  for (const c of companies) {
    const recipients = c.users.map((u) => u.email);

    // App credits expiring.
    if (c.applicationCreditsExpiresAt && recipients.length > 0) {
      const days = daysUntil(c.applicationCreditsExpiresAt, now);
      if (creditsReminderDue(days, c.applicationCredits)) {
        const props = {
          companyName: c.name,
          creditsRemaining: c.applicationCredits,
          expiresAt: fmtDate(c.applicationCreditsExpiresAt),
          buyCreditsUrl: `${origin}/company/buy/credits`,
        };
        const sent = await sendOnce(
          {
            companyId: c.id,
            kind: "credits_expiring_30",
            refId: c.id,
            periodKey: isoDate(c.applicationCreditsExpiresAt),
          },
          () => sendEmail({ to: recipients, subject: AppCreditsExpiringEmail.subject(props), react: AppCreditsExpiringEmail(props) }),
        );
        if (sent) creditsReminded++;
      }
    }

    // Balance alerts (mutually exclusive).
    const kind = balanceAlertKind(c.certBalance, c.certAlertThreshold);
    if (kind === "exhausted") {
      const to = adminEmail ? [...recipients, adminEmail] : recipients;
      if (to.length > 0) {
        const props = { companyName: c.name, buyCertsUrl: `${origin}/company/buy/certs` };
        const sent = await sendWithCooldown(c.id, "balance_exhausted", now, () =>
          sendEmail({ to, subject: CertBalanceExhaustedEmail.subject(props), react: CertBalanceExhaustedEmail(props) }),
        );
        if (sent) exhausted++;
      }
    } else if (kind === "low" && recipients.length > 0) {
      const props = {
        companyName: c.name,
        certBalance: c.certBalance,
        threshold: c.certAlertThreshold,
        buyCertsUrl: `${origin}/company/buy/certs`,
      };
      const sent = await sendWithCooldown(c.id, "low_balance", now, () =>
        sendEmail({ to: recipients, subject: LowCertBalanceEmail.subject(props), react: LowCertBalanceEmail(props) }),
      );
      if (sent) lowBalance++;
    }
  }

  return NextResponse.json({ ok: true, coursesReminded, creditsReminded, lowBalance, exhausted });
}
```

- [ ] **Step 2: Typecheck and build**

Run: `pnpm typecheck && pnpm build`
Expected: zero type errors; build succeeds and `/api/cron/dental-ace-lifecycle` appears in the route list. (If `prisma.notificationLog` is not found, Task 3 Step 3 did not run `prisma generate` — run `pnpm exec prisma generate`.)

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/dental-ace-lifecycle/route.ts
git commit -m "feat(cron): consolidated daily dental-ace lifecycle notifications"
```

---

## Task 5: Dashboard widget copy fix

**Files:**
- Modify: `app/company/page.tsx`

- [ ] **Step 1: Replace the placeholder warning string**

In `app/company/page.tsx`, find the low-balance branch in the cert-balance widget:
```tsx
          {lowBalance ? (
            <p className="text-[11px] text-ace-dark">
              ⚠ Low balance alert active · email + banner
            </p>
          ) : null}
```
Replace the inner text with a real customer-facing warning (no em dash):
```tsx
          {lowBalance ? (
            <p className="text-[11px] text-ace-dark">
              ⚠ Low balance, top up to keep issuing certificates
            </p>
          ) : null}
```

- [ ] **Step 2: Typecheck and commit**

Run: `pnpm typecheck`
Expected: zero errors.
```bash
git add app/company/page.tsx
git commit -m "fix(company): real low-balance warning copy on dashboard widget"
```

---

## Task 6: vercel.json cron entry + final verification

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Add the cron entry**

`vercel.json` currently is:
```json
{
  "crons": [
    {
      "path": "/api/cron/protrack-reminders",
      "schedule": "0 14 * * *"
    }
  ]
}
```
Add the lifecycle cron so it reads:
```json
{
  "crons": [
    {
      "path": "/api/cron/protrack-reminders",
      "schedule": "0 14 * * *"
    },
    {
      "path": "/api/cron/dental-ace-lifecycle",
      "schedule": "0 12 * * *"
    }
  ]
}
```

- [ ] **Step 2: Full verification gate**

Run:
```bash
pnpm test && pnpm typecheck && pnpm build
```
Expected: all tests pass (incl. `lib/notifications/lifecycle.test.ts`); zero type errors; build succeeds with `/api/cron/dental-ace-lifecycle` listed.

- [ ] **Step 3: Smoke-test the cron locally (optional but recommended)**

With the dev server running (`pnpm dev`), in another shell:
```bash
curl -s http://localhost:3000/api/cron/dental-ace-lifecycle
```
Expected (non-production, no CRON_SECRET set): a JSON body like `{"ok":true,"coursesReminded":0,"creditsReminded":0,"lowBalance":N,"exhausted":M}`. With the seeded Texas Dental Association company (low/zero balance depending on seed), emails fire in log mode (no RESEND_API_KEY) or for real (if set). Re-running immediately should NOT resend (dedupe/cooldown) — counts drop to 0 for the balance kinds.

- [ ] **Step 4: Commit**

```bash
git add vercel.json
git commit -m "chore(cron): schedule daily dental-ace lifecycle cron"
```

---

## Self-Review (completed during authoring)

- **Spec coverage:** consolidated daily cron (Task 4), course-expiry 60d/30d send-once (Tasks 1+4), app-credit-expiry 30d send-once (Tasks 1+4), low + exhausted balance with 7-day cooldown and mutual exclusion + AADB_ADMIN_EMAIL on exhausted (Tasks 1+4), `notification_log` table with non-null `refId` + RLS (Task 3), four email templates (Task 2), dashboard widget copy (Task 5), `vercel.json` entry (Task 6), Vitest on all pure logic (Task 1). All spec sections map to a task.
- **Placeholder scan:** no TBD/TODO; every code step is complete. The only deferred action is applying the RLS via Supabase MCP (Task 3 Step 5), with an explicit fallback.
- **Type/name consistency:** the email prop types (`CourseExpiringProps` etc.) and their `.subject` signatures match the cron's `props` objects field-for-field; `dueCourseReminders` returns `"d60"|"d30"` consumed by the cron's `kind`/`daysRemaining` mapping; `balanceAlertKind` returns `"exhausted"|"low"|null` consumed by the cron's branches; `notification_log` columns (`companyId`, `kind`, `refId`, `periodKey`, `sentAt`) match the `sendOnce`/`sendWithCooldown` inserts and the `@@unique`.
- **DB-task caution:** Task 3 is flagged as touching the live database; the controller may run it directly. The cron route (Task 4) is intentionally not unit-tested, matching `protrack-reminders`.
- **Out of scope (M3):** admin tooling, state-board dashboard, ACE badge, login/submit rate limiting; Verify-stream code untouched.
