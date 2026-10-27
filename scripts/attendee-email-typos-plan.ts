/*
  Pure half of scripts/correct-attendee-email-typos.ts: the manifest, strict
  argument parsing, and the preflight rules. No database, no network, so every
  rule that can abort the run is unit-tested (attendee-email-typos-plan.test.ts).
*/
import { z } from "zod";

export const TYPO_REASON = "client-reported .con typo (2026-10-27)";

export type CertTarget = {
  label: string;
  issuedCertificateId: string;
  courseIdNumber: string;
  from: string;
  to: string;
  /**
   * The account that must own `to` once corrected (and may already hold the
   * ProTrack copy of this cert). null = nobody may hold `to` yet.
   */
  accountUserId: string | null;
  /** Create the ProTrack copy (ce_certificates) for accountUserId after correcting. */
  linkToProTrack: boolean;
  /** Re-send the certificate-issued email to `to`. */
  resend: boolean;
};

export type AccountTarget = {
  label: string;
  userId: string;
  from: string;
  to: string;
};

const KYLE_USER_ID = "f6fcc296-f6ae-4f3c-be76-95617950f6c0";
const EILEEN_USER_ID = "e2e1413e-e3d9-4696-b72d-9ab930d61b42";
const SHEELA_USER_ID = "a2610ef0-60f3-4ec5-8b9e-dae7c0ff093a";

// Verified against prod 2026-10-27.
export const CERT_TARGETS: CertTarget[] = [
  {
    label: "Kyle Lesko",
    issuedCertificateId: "cb3a8957-3779-49a4-b25e-1e9303c8b1e3",
    courseIdNumber: "ACE-2026-00012",
    from: "leskokyle@gmail.con",
    to: "leskokyle@gmail.com",
    // Verified legacy-provisioned account; his other cert is already linked.
    accountUserId: KYLE_USER_ID,
    linkToProTrack: true,
    resend: true,
  },
  {
    // His two .com rows on this course are FAILED attempts (preflight re-checks
    // that no PASSED .com row exists). No account: the email's claim link sends
    // him to sign-up, where verification backfills the cert.
    label: "Stephen Scott Hall",
    issuedCertificateId: "c96ff277-e5f6-40bb-9b89-b4c76f50ce6a",
    courseIdNumber: "ACE-2026-00033",
    from: "comdentdental@yahoo.con",
    to: "comdentdental@yahoo.com",
    accountUserId: null,
    linkToProTrack: false,
    resend: true,
  },
  // Legacy certificates: already in the account's ProTrack, no re-send.
  {
    label: "Eileen Nowak",
    issuedCertificateId: "b8cea3e3-3252-48d6-b866-1c424fae1d49",
    courseIdNumber: "ACE-LEG-00076",
    from: "eanowak67@gmail.con",
    to: "eanowak67@gmail.com",
    accountUserId: EILEEN_USER_ID,
    linkToProTrack: false,
    resend: false,
  },
  {
    label: "Eileen Nowak",
    issuedCertificateId: "9e316b46-8560-4e6a-9f6a-c9a5697d2d10",
    courseIdNumber: "ACE-LEG-00076",
    from: "eanowak67@gmail.con",
    to: "eanowak67@gmail.com",
    accountUserId: EILEEN_USER_ID,
    linkToProTrack: false,
    resend: false,
  },
  {
    label: "Sheela Kudchadker",
    issuedCertificateId: "d0486a62-2357-461e-9795-e29eaa65dd6a",
    courseIdNumber: "ACE-LEG-00030",
    from: "shirodsa@icloud.con",
    to: "shirodsa@icloud.com",
    accountUserId: SHEELA_USER_ID,
    linkToProTrack: false,
    resend: false,
  },
];

export const ACCOUNT_TARGETS: AccountTarget[] = [
  { label: "Eileen Nowak", userId: EILEEN_USER_ID, from: "eanowak67@gmail.con", to: "eanowak67@gmail.com" },
  { label: "Sheela Kudchadker", userId: SHEELA_USER_ID, from: "shirodsa@icloud.con", to: "shirodsa@icloud.com" },
];

export const EXCLUDED = [
  {
    label: "Rosario Salerno",
    issuedCertificateId: "dbcb49e7-4864-4dae-aca7-fc0fa43b4cdb",
    email: "rcacer1@gmail.con",
    reason:
      "already holds a separate PASSED certificate under rcacer1@gmail.com on the same course; correcting would create a duplicate passed certificate",
  },
];

// ── arguments ────────────────────────────────────────────────────────────────

export type TypoMode = "dry-run" | "rehearse" | "apply" | "send-email";

export type TypoArgs = {
  /** "send-email" = standalone send after an earlier --apply. */
  mode: TypoMode;
  /** --apply --send-email: send right after a successful apply. */
  sendAfterApply: boolean;
  /** Deliver every email to this address instead (no idempotency key, no sent log). */
  testTo: string | null;
};

const KNOWN_FLAGS = ["--dry-run", "--rehearse", "--apply", "--send-email"] as const;

const flagsSchema = z
  .object({
    dryRun: z.boolean(),
    rehearse: z.boolean(),
    apply: z.boolean(),
    sendEmail: z.boolean(),
    testTo: z.email({ error: "--test-to needs an email address: --test-to=<email>" }).nullable(),
  })
  .superRefine((f, ctx) => {
    if ([f.dryRun, f.rehearse, f.apply].filter(Boolean).length > 1) {
      ctx.addIssue({ code: "custom", message: "Use one of --dry-run, --rehearse or --apply at a time." });
    }
    if (f.sendEmail && (f.dryRun || f.rehearse)) {
      ctx.addIssue({
        code: "custom",
        message: "--send-email only runs with --apply or on its own. Dry runs and rehearsals never send email.",
      });
    }
    if (f.testTo !== null && !f.sendEmail) {
      ctx.addIssue({ code: "custom", message: "--test-to is only valid with --send-email." });
    }
  });

/**
 * Strict: anything unrecognised is an error, so "--test-to me@x.com" (space
 * instead of "=") can never fall through to a real send.
 */
export function parseTypoArgs(argv: string[]): TypoArgs {
  const raw = { dryRun: false, rehearse: false, apply: false, sendEmail: false, testTo: null as string | null };
  for (const arg of argv) {
    if ((KNOWN_FLAGS as readonly string[]).includes(arg)) {
      if (arg === "--dry-run") raw.dryRun = true;
      if (arg === "--rehearse") raw.rehearse = true;
      if (arg === "--apply") raw.apply = true;
      if (arg === "--send-email") raw.sendEmail = true;
    } else if (arg.startsWith("--test-to=")) {
      raw.testTo = arg.slice("--test-to=".length).trim().toLowerCase();
    } else {
      throw new Error(`Unrecognised argument "${arg}". Values are written with "=", for example --test-to=<email>.`);
    }
  }
  const parsed = flagsSchema.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(" "));
  const f = parsed.data;
  const mode: TypoMode = f.rehearse ? "rehearse" : f.apply ? "apply" : f.sendEmail ? "send-email" : "dry-run";
  return { mode, sendAfterApply: f.apply && f.sendEmail, testTo: f.testTo };
}

// ── preflight ────────────────────────────────────────────────────────────────

export type EmailState = "pending" | "done" | "mismatch";

/** pending = still the typo; done = already corrected (a re-run); mismatch = changed by someone else. */
export function emailState(current: string | null | undefined, from: string, to: string): EmailState {
  const c = current?.trim().toLowerCase();
  if (c === from.toLowerCase()) return "pending";
  if (c === to.toLowerCase()) return "done";
  return "mismatch";
}

export type CertSnapshot = {
  target: CertTarget;
  row: { attendeeEmail: string; passed: boolean; courseIdNumber: string | null } | null;
  /** Ids of OTHER passed certificates on the same course under lower(to). */
  otherPassedIds: string[];
  /** licenseeId of the ProTrack copy of this cert, if one exists. */
  ceLinkedUserId: string | null;
  /** public.users ids whose lower(email) = lower(to). */
  usersWithTo: string[];
  /** auth.users ids whose lower(email) = lower(to). */
  authWithTo: string[];
};

export type AccountSnapshot = {
  target: AccountTarget;
  dbEmail: string | null;
  authEmail: string | null;
  usersWithTo: string[];
  authWithTo: string[];
};

const others = (ids: string[], allowed: string | null) => ids.filter((id) => id !== allowed);

/** Every rule that must hold before (and again, under lock, during) the write. */
export function preflightViolations(certs: CertSnapshot[], accounts: AccountSnapshot[]): string[] {
  const out: string[] = [];
  for (const c of certs) {
    const t = c.target;
    const tag = `${t.label} cert ${t.issuedCertificateId}`;
    if (!c.row) {
      out.push(`${tag}: not found.`);
      continue;
    }
    if (!c.row.passed) out.push(`${tag}: is not a passed certificate.`);
    if (c.row.courseIdNumber !== t.courseIdNumber) {
      out.push(`${tag}: is on ${c.row.courseIdNumber ?? "no course"}, expected ${t.courseIdNumber}.`);
    }
    if (emailState(c.row.attendeeEmail, t.from, t.to) === "mismatch") {
      out.push(`${tag}: email is now ${c.row.attendeeEmail}, expected ${t.from}. Someone changed it; re-verify by hand.`);
    }
    if (c.otherPassedIds.length > 0) {
      out.push(`${tag}: ${t.to} already holds a PASSED certificate on ${t.courseIdNumber} (${c.otherPassedIds.join(", ")}).`);
    }
    if (c.ceLinkedUserId !== null && c.ceLinkedUserId !== t.accountUserId) {
      out.push(`${tag}: its ProTrack copy belongs to user ${c.ceLinkedUserId}, not the expected account.`);
    }
    const strayUsers = others(c.usersWithTo, t.accountUserId);
    if (strayUsers.length > 0) out.push(`${tag}: ${t.to} belongs to a different account (${strayUsers.join(", ")}).`);
    const strayAuth = others(c.authWithTo, t.accountUserId);
    if (strayAuth.length > 0) out.push(`${tag}: ${t.to} belongs to a different Auth user (${strayAuth.join(", ")}).`);
    // Kyle's account must already own the corrected email, or the link step
    // would attach to nobody. (Eileen/Sheela get there in this same run.)
    const accountRenamedHere = ACCOUNT_TARGETS.some((a) => a.userId === t.accountUserId);
    if (t.linkToProTrack && t.accountUserId && !accountRenamedHere && !c.usersWithTo.includes(t.accountUserId)) {
      out.push(`${tag}: expected account ${t.accountUserId} to own ${t.to}, but it does not.`);
    }
  }
  for (const a of accounts) {
    const t = a.target;
    const tag = `${t.label} account ${t.userId}`;
    if (a.dbEmail === null) out.push(`${tag}: no public.users row.`);
    else if (emailState(a.dbEmail, t.from, t.to) === "mismatch") {
      out.push(`${tag}: users.email is now ${a.dbEmail}, expected ${t.from}.`);
    }
    if (a.authEmail === null) out.push(`${tag}: no Supabase Auth user.`);
    else if (emailState(a.authEmail, t.from, t.to) === "mismatch") {
      out.push(`${tag}: Auth email is now ${a.authEmail}, expected ${t.from}.`);
    }
    const strayUsers = others(a.usersWithTo, t.userId);
    if (strayUsers.length > 0) out.push(`${tag}: ${t.to} belongs to a different account (${strayUsers.join(", ")}).`);
    const strayAuth = others(a.authWithTo, t.userId);
    if (strayAuth.length > 0) out.push(`${tag}: ${t.to} belongs to a different Auth user (${strayAuth.join(", ")}).`);
  }
  return out;
}

/** Database work still to do (Auth is tracked separately: it lives outside the transaction). */
export function pendingDbWork(certs: CertSnapshot[], accounts: AccountSnapshot[]) {
  return {
    certs: certs.filter((c) => c.row && emailState(c.row.attendeeEmail, c.target.from, c.target.to) === "pending"),
    links: certs.filter((c) => c.target.linkToProTrack && c.ceLinkedUserId === null),
    accounts: accounts.filter((a) => emailState(a.dbEmail, a.target.from, a.target.to) === "pending"),
  };
}

export function pendingAuth(accounts: AccountSnapshot[]): AccountSnapshot[] {
  return accounts.filter((a) => emailState(a.authEmail, a.target.from, a.target.to) === "pending");
}
