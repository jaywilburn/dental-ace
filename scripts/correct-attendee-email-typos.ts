/*
  One-off correction, client request 2026-10-27: four attendees typed ".con"
  instead of ".com" on the attendee form (or in the legacy sheet), so their
  certificate emails bounced and the certificates never reached ProTrack.
  Spec: .scratch/attendee-email-typos/spec.md. Targets and rules live in
  scripts/attendee-email-typos-plan.ts (unit-tested).

    A) Kyle Lesko: one course cert -> .com, then link it into his existing
       ProTrack account (same mapping as lib/protrack/ace-sync.ts), re-send.
    B) Stephen Scott Hall: one course cert -> .com, re-send (no account; the
       claim link routes him to sign-up, whose verification backfills it).
    C) Eileen Nowak: two legacy certs + her account (public.users AND Supabase
       Auth) -> .com. No re-send.
    D) Sheela Kudchadker: one legacy cert + her account -> .com. No re-send.
    Excluded: Rosario Salerno (already holds a passed .com cert on that course).

  Every target is matched by id AND its expected current email. A target that
  already shows the corrected email is a no-op, so re-running is safe; anything
  else aborts the whole run. Preflight runs before any write and again inside
  the transaction under row locks.

  Usage:
    pnpm fix:attendee-email-typos                         dry run: print the plan, write nothing
    pnpm fix:attendee-email-typos --rehearse              run the real transaction, then roll it back
    pnpm fix:attendee-email-typos --apply                 database changes, then the Auth email changes
    pnpm fix:attendee-email-typos --send-email --test-to=<you>   send both emails to yourself first
    pnpm fix:attendee-email-typos --apply --send-email    apply, then email Kyle and Stephen
    pnpm fix:attendee-email-typos --send-email            email Kyle and Stephen (after --apply)

  Supabase Auth cannot join the database transaction: --rehearse only prints
  the Auth calls, and --apply makes them after the transaction commits (a
  re-run finishes any that failed). Each real email carries a Resend
  idempotency key per certificate, and a successful send is recorded in
  .scratch/attendee-email-typos/sent.json so a later run does not mail twice.
  Emails go straight through Resend: EMAIL_TEST_BCC is NOT applied.

  .env.local holds a LIVE RESEND_API_KEY: only --send-email ever sends.
*/
import { config } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { AdminAuditAction, Prisma, PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { attachIssuedCertToMatchingAccount } from "@/lib/protrack/ace-sync-core";
import { signCertClaimToken } from "@/lib/protrack/cert-claim-token";
import { renderCertificatePdf } from "@/lib/pdf/certificate";
import CertificateIssuedEmail from "@/emails/certificate-issued";
import {
  ACCOUNT_TARGETS,
  CERT_TARGETS,
  EXCLUDED,
  TYPO_REASON,
  emailState,
  parseTypoArgs,
  pendingAuth,
  pendingDbWork,
  preflightViolations,
  type AccountSnapshot,
  type CertSnapshot,
} from "./attendee-email-typos-plan";

config({ path: ".env.local" });

// Pinned instead of appBaseUrl(): .env.local has no NEXT_PUBLIC_APP_URL, so
// appBaseUrl() would fall back to localhost, and the apex domain redirects.
// Links in a certificate email are long-lived.
const BASE_URL = "https://www.dentalace.org";
const CERTS_BUCKET = process.env.SUPABASE_STORAGE_BUCKET_CERTS ?? "certificates";
const ADMIN_EMAIL = "jay@wilburncreative.com";
const OUT_DIR = join(process.cwd(), ".scratch", "attendee-email-typos");
const SENT_LOG = join(OUT_DIR, "sent.json");

/** Thrown at the end of a --rehearse transaction so every statement runs and nothing commits. */
class RehearsalRollback extends Error {}

type Client = PrismaClient | Prisma.TransactionClient;

const certIds = CERT_TARGETS.map((t) => t.issuedCertificateId);
const accountIds = ACCOUNT_TARGETS.map((a) => a.userId);
const lower = (s: string) => s.toLowerCase();

/** auth.users rows by id or by lower(email). The DB role can read the auth schema. */
async function authUsers(client: Client, ids: string[], emails: string[]) {
  return client.$queryRaw<{ id: string; email: string | null }[]>`
    select id::text as id, email from auth.users
    where id = any(${ids}::uuid[]) or lower(email) = any(${emails.map(lower)}::text[])`;
}

async function loadSnapshot(client: Client): Promise<{ certs: CertSnapshot[]; accounts: AccountSnapshot[] }> {
  const toEmails = [...new Set([...CERT_TARGETS, ...ACCOUNT_TARGETS].map((t) => lower(t.to)))];

  const rows = await client.issuedCertificate.findMany({
    where: { id: { in: certIds } },
    select: {
      id: true,
      attendeeEmail: true,
      passed: true,
      courseId: true,
      course: { select: { courseIdNumber: true } },
      ceCertificate: { select: { licenseeId: true } },
    },
  });
  const users = await client.user.findMany({
    where: {
      OR: [
        { id: { in: accountIds } },
        ...toEmails.map((e) => ({ email: { equals: e, mode: "insensitive" as const } })),
      ],
    },
    select: { id: true, email: true },
  });
  const auth = await authUsers(client, accountIds, toEmails);
  const idsWithEmail = (list: { id: string; email: string | null }[], email: string) =>
    list.filter((u) => u.email && lower(u.email) === lower(email)).map((u) => u.id);

  const certs: CertSnapshot[] = [];
  for (const target of CERT_TARGETS) {
    const row = rows.find((r) => r.id === target.issuedCertificateId) ?? null;
    const otherPassed = row?.courseId
      ? await client.issuedCertificate.findMany({
          where: {
            courseId: row.courseId,
            passed: true,
            id: { not: row.id },
            attendeeEmail: { equals: target.to, mode: "insensitive" },
          },
          select: { id: true },
        })
      : [];
    certs.push({
      target,
      row: row
        ? { attendeeEmail: row.attendeeEmail, passed: row.passed, courseIdNumber: row.course?.courseIdNumber ?? null }
        : null,
      otherPassedIds: otherPassed.map((r) => r.id),
      ceLinkedUserId: row?.ceCertificate?.licenseeId ?? null,
      usersWithTo: idsWithEmail(users, target.to),
      authWithTo: idsWithEmail(auth, target.to),
    });
  }
  const accounts: AccountSnapshot[] = ACCOUNT_TARGETS.map((target) => ({
    target,
    dbEmail: users.find((u) => u.id === target.userId)?.email ?? null,
    authEmail: auth.find((u) => u.id === target.userId)?.email ?? null,
    usersWithTo: idsWithEmail(users, target.to),
    authWithTo: idsWithEmail(auth, target.to),
  }));
  return { certs, accounts };
}

function assertPreflight(certs: CertSnapshot[], accounts: AccountSnapshot[]): void {
  const violations = preflightViolations(certs, accounts);
  if (violations.length > 0) {
    throw new Error(`Preflight failed, nothing was written:\n  ${violations.join("\n  ")}`);
  }
}

function printPlan(certs: CertSnapshot[], accounts: AccountSnapshot[]): void {
  console.log("\nCertificates");
  for (const c of certs) {
    const t = c.target;
    const state = emailState(c.row?.attendeeEmail, t.from, t.to);
    const link = t.linkToProTrack
      ? c.ceLinkedUserId
        ? `  ProTrack: linked to ${c.ceLinkedUserId}`
        : `  ProTrack: link to ${t.accountUserId}`
      : c.ceLinkedUserId
        ? `  ProTrack: stays linked to ${c.ceLinkedUserId}`
        : "";
    console.log(
      `  ${t.label.padEnd(20)} ${t.issuedCertificateId}  ${t.courseIdNumber}  ${t.from} -> ${t.to}` +
        `${state === "done" ? "  (already corrected)" : ""}${link}${t.resend ? "  re-send email" : ""}`,
    );
  }
  console.log("\nAccounts (public.users + Supabase Auth)");
  for (const a of accounts) {
    const t = a.target;
    const db = emailState(a.dbEmail, t.from, t.to) === "done" ? "done" : "pending";
    const auth = emailState(a.authEmail, t.from, t.to) === "done" ? "done" : "pending";
    console.log(`  ${t.label.padEnd(20)} ${t.userId}  ${t.from} -> ${t.to}  (users: ${db}, Auth: ${auth})`);
  }
  console.log("\nExcluded");
  for (const e of EXCLUDED) console.log(`  ${e.label.padEnd(20)} ${e.issuedCertificateId}  ${e.email}: ${e.reason}`);
}

async function main(): Promise<void> {
  const { mode, sendAfterApply, testTo } = parseTypoArgs(process.argv.slice(2));
  const rehearse = mode === "rehearse";

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) });
  try {
    console.log(`Target DB: ${new URL(dbUrl).host}  |  mode: ${mode}${sendAfterApply ? " + send-email" : ""}`);

    const admin = await prisma.user.findUnique({
      where: { email: ADMIN_EMAIL },
      select: { id: true, staffRole: true },
    });
    if (!admin || admin.staffRole !== "ADMIN") throw new Error(`${ADMIN_EMAIL} is not an ADMIN account.`);

    const before = await loadSnapshot(prisma);
    assertPreflight(before.certs, before.accounts);
    printPlan(before.certs, before.accounts);
    const work = pendingDbWork(before.certs, before.accounts);
    const authWork = pendingAuth(before.accounts);
    console.log(
      `\nTotals: ${work.certs.length} certificate email(s) to correct, ${work.accounts.length} account email(s), ` +
        `${work.links.length} ProTrack link(s), ${authWork.length} Auth email(s).`,
    );

    // The audit action ships in prisma/migrations/20261027120000_course_retired_at
    // (shared with "Retire course"). Without it every audit insert would fail.
    const [{ present: auditEnumReady }] = await prisma.$queryRaw<{ present: boolean }[]>`
      select exists (
        select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
        where t.typname = 'AdminAuditAction' and e.enumlabel = 'CERTIFICATE_EMAIL_CORRECTED'
      ) as present`;
    if (!auditEnumReady) {
      const msg =
        "AdminAuditAction.CERTIFICATE_EMAIL_CORRECTED is not in this database yet. Apply migration " +
        "20261027120000_course_retired_at (pnpm exec prisma migrate deploy) before --rehearse or --apply.";
      if (mode !== "dry-run") throw new Error(msg);
      console.warn(`\nWARNING: ${msg}`);
    }

    if (mode === "dry-run") {
      console.log("\nDry run only. Re-run with --rehearse to prove the transaction, then --apply to write.");
      return;
    }

    if (mode === "apply" || rehearse) {
      const hasDbWork = work.certs.length + work.accounts.length + work.links.length > 0;
      if (hasDbWork) {
        if (!rehearse) {
          mkdirSync(OUT_DIR, { recursive: true });
          const backupPath = join(OUT_DIR, `backup-${Date.now()}.json`);
          const backup = {
            takenAt: new Date().toISOString(),
            issuedCertificates: await prisma.issuedCertificate.findMany({ where: { id: { in: certIds } } }),
            ceCertificates: await prisma.ceCertificate.findMany({ where: { issuedCertificateId: { in: certIds } } }),
            users: await prisma.user.findMany({
              where: { id: { in: [...accountIds, ...CERT_TARGETS.flatMap((t) => (t.accountUserId ? [t.accountUserId] : []))] } },
            }),
            authUsers: await authUsers(prisma, accountIds, []),
          };
          writeFileSync(backupPath, JSON.stringify(backup, null, 2));
          console.log(`\nBackup written: ${backupPath}`);
        }

        try {
          await prisma.$transaction(
            async (tx) => {
              await tx.$executeRaw`select id from public.issued_certificates where id = any(${certIds}::uuid[]) for update`;
              await tx.$executeRaw`select id from public.users where id = any(${accountIds}::uuid[]) for update`;
              const locked = await loadSnapshot(tx);
              assertPreflight(locked.certs, locked.accounts);
              const w = pendingDbWork(locked.certs, locked.accounts);

              for (const a of w.accounts) {
                const res = await tx.user.updateMany({
                  where: { id: a.target.userId, email: a.dbEmail! },
                  data: { email: a.target.to },
                });
                if (res.count !== 1) throw new Error(`${a.target.label}: account row changed mid-run. Nothing was written.`);
                // Same row shape as updateProfile's PROFILE_UPDATED (lib/admin/users.ts),
                // written directly: lib/admin/audit.ts loads the app Prisma client.
                await tx.adminAuditLog.create({
                  data: {
                    actorUserId: admin.id,
                    targetUserId: a.target.userId,
                    action: AdminAuditAction.PROFILE_UPDATED,
                    summary: `Updated profile for ${a.target.to}`,
                    details: {
                      before: { email: a.dbEmail },
                      after: { email: a.target.to },
                      reason: TYPO_REASON,
                    },
                  },
                });
                console.log(`  account  ${a.target.label}: ${a.dbEmail} -> ${a.target.to}`);
              }

              for (const c of w.certs) {
                const t = c.target;
                const res = await tx.issuedCertificate.updateMany({
                  where: { id: t.issuedCertificateId, attendeeEmail: c.row!.attendeeEmail },
                  data: { attendeeEmail: t.to },
                });
                if (res.count !== 1) throw new Error(`${t.label}: certificate changed mid-run. Nothing was written.`);
                await tx.adminAuditLog.create({
                  data: {
                    actorUserId: admin.id,
                    targetUserId: null,
                    action: AdminAuditAction.CERTIFICATE_EMAIL_CORRECTED,
                    summary: `Corrected attendee email on certificate ${t.issuedCertificateId} (${t.courseIdNumber}): ${c.row!.attendeeEmail} to ${t.to}`,
                    details: {
                      issuedCertificateId: t.issuedCertificateId,
                      courseIdNumber: t.courseIdNumber,
                      from: c.row!.attendeeEmail,
                      to: t.to,
                      reason: TYPO_REASON,
                    },
                  },
                });
                console.log(`  cert     ${t.label} ${t.issuedCertificateId}: ${c.row!.attendeeEmail} -> ${t.to}`);
              }

              // The correction is the proof of ownership here (client-reported,
              // admin-applied), so attach exactly as the claim route would.
              for (const c of w.links) {
                const t = c.target;
                const result = await attachIssuedCertToMatchingAccount(tx, t.issuedCertificateId);
                const ce = await tx.ceCertificate.findUnique({
                  where: { issuedCertificateId: t.issuedCertificateId },
                  select: { licenseeId: true },
                });
                if (result.status !== "attached" || ce?.licenseeId !== t.accountUserId) {
                  throw new Error(`${t.label}: ProTrack link did not land on ${t.accountUserId} (${result.status}). Nothing was written.`);
                }
                console.log(`  ProTrack ${t.label} ${t.issuedCertificateId}: linked to ${t.accountUserId}`);
              }

              console.log(
                `${rehearse ? "Rehearsed" : "Applied"}: ${w.certs.length} certificate(s), ${w.accounts.length} account(s), ${w.links.length} ProTrack link(s), ${w.certs.length + w.accounts.length} audit row(s).`,
              );
              if (rehearse) throw new RehearsalRollback();
            },
            { timeout: 30_000, maxWait: 10_000 },
          );
        } catch (err) {
          if (!(err instanceof RehearsalRollback)) throw err;
          console.log("Rehearsal passed: every statement succeeded under the row locks, then the transaction was rolled back.");
        }
      } else {
        console.log("\nNo database changes pending.");
      }

      if (rehearse) {
        for (const a of authWork) {
          console.log(`Would call Supabase Auth: updateUserById(${a.target.userId}, { email: "${a.target.to}", email_confirm: true })`);
        }
        console.log("Nothing changed (database rolled back, Auth not called, no email sent).");
        return;
      }

      // Auth after the commit: re-read so a re-run finishes earlier failures.
      const afterCommit = pendingAuth((await loadSnapshot(prisma)).accounts);
      if (afterCommit.length > 0) {
        if (!supabaseUrl || !serviceRoleKey) {
          throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to update Supabase Auth, then re-run --apply.");
        }
        const sb = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        for (const a of afterCommit) {
          // Same call as updateProfile (lib/admin/users.ts). Both accounts were
          // already verified, so the corrected address stays confirmed.
          const { error } = await sb.auth.admin.updateUserById(a.target.userId, {
            email: a.target.to,
            email_confirm: true,
          });
          if (error) {
            process.exitCode = 1;
            console.error(
              `AUTH UPDATE FAILED for ${a.target.label}: ${error.message}\n` +
                `  public.users already says ${a.target.to}; Supabase Auth still says ${a.authEmail}, so sign-in will not match.\n` +
                `  Recover: re-run "pnpm fix:attendee-email-typos --apply" (only the Auth step remains), or in the Supabase\n` +
                `  dashboard set Auth user ${a.target.userId} email to ${a.target.to} and confirm it.`,
            );
          } else {
            console.log(`  Auth     ${a.target.label}: ${a.authEmail} -> ${a.target.to}`);
          }
        }
      }
      if (!sendAfterApply) {
        console.log("\nApplied. Send the certificate emails with --send-email (try --test-to=<you> first).");
        return;
      }
    }

    // ── --send-email ──────────────────────────────────────────────────────────
    const now = await loadSnapshot(prisma);
    const unapplied = pendingDbWork(now.certs, now.accounts);
    if (unapplied.certs.length + unapplied.accounts.length + unapplied.links.length > 0) {
      throw new Error("There are unapplied changes. Run --apply first.");
    }
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not set");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the stored PDF is read from storage).");
    }
    const resend = new Resend(apiKey);
    const from = process.env.RESEND_FROM_EMAIL ?? "noreply@dentalace.org";
    const sentLog: Record<string, string> = existsSync(SENT_LOG) ? JSON.parse(readFileSync(SENT_LOG, "utf8")) : {};
    if (testTo) console.log(`\nTEST SEND: every email below goes to ${testTo}, not to the attendee.`);

    const storedPdf = async (path: string): Promise<Buffer | null> => {
      const res = await fetch(`${supabaseUrl}/storage/v1/object/authenticated/${CERTS_BUCKET}/${path}`, {
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      });
      if (res.status === 400 || res.status === 404) return null;
      if (!res.ok) throw new Error(`PDF download failed (${path}): ${res.status} ${await res.text()}`);
      return Buffer.from(await res.arrayBuffer());
    };

    let checkedClaimLink = false;
    const failures: string[] = [];
    for (const target of CERT_TARGETS.filter((t) => t.resend)) {
      if (!testTo && sentLog[target.issuedCertificateId]) {
        console.log(`Skipped: ${target.label}, already sent ${sentLog[target.issuedCertificateId]} (see ${SENT_LOG}).`);
        continue;
      }
      const row = await prisma.issuedCertificate.findUniqueOrThrow({
        where: { id: target.issuedCertificateId },
        select: {
          id: true,
          attendeeName: true,
          attendeeEmail: true,
          passed: true,
          licenseNumber: true,
          deliveryMethod: true,
          certPdfUrl: true,
          completedAt: true,
          issuedAt: true,
          course: {
            select: {
              courseIdNumber: true,
              attendeeLinkToken: true,
              retiredAt: true,
              application: { select: { courseTitle: true, ceHours: true } },
            },
          },
        },
      });
      if (!row.passed || !row.course || lower(row.attendeeEmail) !== lower(target.to)) {
        throw new Error(`${target.label}: certificate is not in the corrected state. Nothing more was sent.`);
      }
      if (row.course.retiredAt) console.warn(`  note: ${row.course.courseIdNumber} is retired; its course-details link shows it closed.`);

      const claimUrl = `${BASE_URL}/api/protrack/claim-certificate?token=${signCertClaimToken(row.id)}`;
      // The token is signed with the LOCAL SESSION_SECRET. Production rejects it
      // (redirect to /login?error=cert_claim) if the secrets differ, so prove one
      // link before anything is sent. A valid link behaves exactly as the
      // attendee's click would (Kyle: idempotent re-attach; Stephen: sign-up).
      if (!checkedClaimLink) {
        const res = await fetch(claimUrl, { redirect: "manual" });
        const location = res.headers.get("location") ?? "";
        if (res.status !== 303 || location.includes("error=cert_claim")) {
          throw new Error(
            "Production rejected the ProTrack claim link: SESSION_SECRET in .env.local does not match production. Nothing was sent.",
          );
        }
        checkedClaimLink = true;
      }

      const courseTitle = row.course.application.courseTitle ?? "Accredited Course";
      const ceHours = Number(row.course.application.ceHours ?? 0);
      const completedAt = row.completedAt ?? row.issuedAt;
      let pdf = row.certPdfUrl ? await storedPdf(row.certPdfUrl) : null;
      if (!pdf) {
        console.log(`  ${target.label}: no stored PDF, re-rendering.`);
        pdf = await renderCertificatePdf({
          attendeeName: row.attendeeName,
          courseTitle,
          courseIdNumber: row.course.courseIdNumber,
          certificateId: row.id,
          ceHours,
          completedAt,
          deliveryMethod: row.deliveryMethod,
          licenseNumber: row.licenseNumber,
        });
      }

      const props = {
        attendeeName: row.attendeeName,
        courseTitle,
        courseIdNumber: row.course.courseIdNumber,
        certificateId: row.id,
        ceHours,
        completedAt: completedAt.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        }),
        verifyUrl: `${BASE_URL}/attend/${row.course.attendeeLinkToken}`,
        claimUrl,
      };
      const subject = CertificateIssuedEmail.subject(props);
      try {
        const { error } = await resend.emails.send(
          {
            from,
            to: testTo ?? row.attendeeEmail,
            subject: testTo ? `[TEST for ${row.attendeeEmail}] ${subject}` : subject,
            react: CertificateIssuedEmail(props),
            // base64, as lib/email/send.ts does.
            attachments: [{ filename: `${row.course.courseIdNumber}-certificate.pdf`, content: pdf.toString("base64") }],
          },
          testTo ? undefined : { idempotencyKey: `cert-email-typo-fix:${row.id}` },
        );
        if (error) throw new Error(error.message);
        if (!testTo) {
          sentLog[row.id] = new Date().toISOString();
          mkdirSync(OUT_DIR, { recursive: true });
          writeFileSync(SENT_LOG, JSON.stringify(sentLog, null, 2));
        }
        console.log(`Sent: ${target.label} <${testTo ?? row.attendeeEmail}>`);
      } catch (err) {
        failures.push(target.label);
        console.error(`FAILED: ${target.label} <${row.attendeeEmail}>: ${(err as Error).message}`);
      }
    }
    if (failures.length > 0) {
      console.log(`\n${failures.length} failed (${failures.join(", ")}). Re-run --send-email; sent ones are skipped.`);
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
