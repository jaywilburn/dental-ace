/*
  One-off correction for Smile Together (ACE-EVT-2026-00024, SELECTIVE_INLINE),
  client request 2026-10-06.

  The attendee form issues one certificate per (event, email). Attendees who
  submitted after their first session were refused when they came back to add
  sessions, and several submitted again under a second email. This script puts
  each of those people back on ONE certificate under their primary email (the
  first email they used):

    1. The kept certificate (the one with the most sessions) gets the union of
       the person's credited sessions and the primary email.
    2. The other passing certificates, and any failed attempts logged under the
       workaround email, are deleted.
    3. Each deleted passing certificate returns one certificate credit to the
       company (ADMIN_OVERRIDE_CERTS + COMPANY_BALANCE_ADJUSTED audit row) and
       comes off the company and event issued counters.
    4. The certificate PDF is re-rendered for everyone flagged `notify`, and the
       deleted certificates' PDFs are removed from storage.

  All database changes run in one transaction under the company row lock. The
  plan is derived from current rows, so re-running after a successful --apply is
  a no-op (no second refund). Affected rows are backed up to JSON before any
  write; a deleted PDF can be re-rendered from that backup.

  Usage:
    pnpm merge:smile-together-certs                  dry run: print the plan, write nothing
    pnpm merge:smile-together-certs --apply          database changes + PDFs
    pnpm merge:smile-together-certs --send-emails    email corrected certificates (after --apply)
    pnpm merge:smile-together-certs --send-emails --only=<primary email>   one recipient (retry)

  BACKUP_DIR overrides where the backup lands (default: logic/, gitignored).
  MERGE_ADMIN_EMAIL overrides the accountable admin (default jay@wilburncreative.com).
  Emails go straight through Resend: EMAIL_TEST_BCC is NOT applied.
*/
import { config } from "dotenv";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { AdminAuditAction, BillingTransactionType, Prisma, PrismaClient } from "@prisma/client";
import { Resend } from "resend";
import { planCertMerge, type CertMergePlan, type MergeSession } from "@/lib/attend/cert-merge";
import { balanceAdjustmentSummary, validateCertBalanceAdjustment } from "@/lib/admin/override-rules";
import { renderEventCertificatePdf } from "@/lib/pdf/event-certificate";
import { signCertClaimToken } from "@/lib/protrack/cert-claim-token";
import CertificateIssuedEmail from "@/emails/certificate-issued";

config({ path: ".env.local" });

const EVENT_ID = "4905d814-89e8-4dda-bc77-0954c37db0c2";
// Pinned: appBaseUrl() falls back to localhost in dev, and the apex domain
// redirects. Links in a certificate email are long-lived.
const BASE_URL = "https://www.dentalace.org";
const CERTS_BUCKET = process.env.SUPABASE_STORAGE_BUCKET_CERTS ?? "certificates";
const DEFAULT_ADMIN_EMAIL = "jay@wilburncreative.com";

type Entry = {
  label: string;
  /** The first email the person used on the event. The merged cert lands here. */
  primaryEmail: string;
  /** Every email this person used. A listed cert under any other email aborts the run. */
  emails: string[];
  /** Every PASSING certificate the person holds on the event. */
  passedCertIds: string[];
  /** Failed attempts logged under a workaround email. */
  failedCertIds: string[];
  /** Sessions credited by admin decision rather than by a quiz answer. */
  addSessionIds: string[];
  /** Re-render the PDF and include in --send-emails. */
  notify: boolean;
};

const MANIFEST: Entry[] = [
  {
    label: "Etta Lobel",
    primaryEmail: "chilmarkdental@aol.com",
    emails: ["chilmarkdental@aol.com", "chilmarkdental@gmail.com"],
    passedCertIds: ["d76e1189-59df-4dec-bb61-6bd4a6d22aaf", "4a8c6b5b-60e6-4e16-8980-1da477545955"],
    failedCertIds: [],
    addSessionIds: [],
    notify: true,
  },
  {
    label: "Thai Nguyen",
    primaryEmail: "tngu141@gmail.com",
    emails: ["tngu141@gmail.com", "tngu141@yahoo.com"],
    passedCertIds: ["bf2f8c97-07fd-43e9-803e-3a894ccd16de", "112a7e21-9873-4e07-9d63-d0703b5efc6f"],
    failedCertIds: [],
    addSessionIds: [],
    notify: true,
  },
  {
    label: "Jessica Figueiredo",
    primaryEmail: "jessicayfigueiredo@gmail.com",
    emails: ["jessicayfigueiredo@gmail.com", "missjessicachoe@gmail.com"],
    passedCertIds: ["3ba0a7a0-0a76-45ab-9414-6fc3fb38174a", "ad16a33d-ea1b-4c0e-890f-26f32fbb1a0d"],
    failedCertIds: [],
    addSessionIds: [],
    notify: true,
  },
  {
    label: "Takeisha Presson",
    primaryEmail: "takeisha.presson@gmail.com",
    emails: ["takeisha.presson@gmail.com", "tpresson@dimplesdentalsuite.com"],
    passedCertIds: ["5f09fad7-2bf0-495a-8748-495e217a3691", "1973e7a2-7f8f-417d-a827-a08c5a9e46e5"],
    failedCertIds: [],
    addSessionIds: [],
    notify: true,
  },
  {
    // Certificate unchanged; only the two failed Yahoo attempts are removed.
    label: "James Choy",
    primaryEmail: "drjameschoy@gmail.com",
    emails: ["drjameschoy@gmail.com", "drjameschoy@yahoo.com"],
    passedCertIds: ["44ae7a6f-0d1e-4e33-90b6-c9ef08859041"],
    failedCertIds: ["d806b0e3-f7c2-460c-a999-54c76af6ab39", "40f8db8d-6fc0-4eb4-a1ff-628dbe360eaf"],
    addSessionIds: [],
    notify: false,
  },
  // The three attendees from the original report used one email only. They stay
  // no-ops until Task 6 fills addSessionIds and flips notify.
  {
    label: "Marifer Martinez-Lujan",
    primaryEmail: "marifermtz@hotmail.com",
    emails: ["marifermtz@hotmail.com"],
    passedCertIds: ["fadda181-5810-4d1c-9d40-7f94f382255f"],
    failedCertIds: [],
    addSessionIds: [],
    notify: false,
  },
  {
    label: "Eileen Huynh",
    primaryEmail: "ekhuynh15@gmail.com",
    emails: ["ekhuynh15@gmail.com"],
    passedCertIds: ["3bc774e2-e63f-4be7-aa62-7a95620d79f7"],
    failedCertIds: [],
    addSessionIds: [],
    notify: false,
  },
  {
    label: "Shaymaa Mohsin",
    primaryEmail: "shaymaa.mohsin@yahoo.com",
    emails: ["shaymaa.mohsin@yahoo.com"],
    passedCertIds: ["95f823c5-48fd-407b-9b55-3d7f9bd6e276"],
    failedCertIds: [],
    addSessionIds: [],
    notify: false,
  },
];

const CERT_SELECT = {
  id: true,
  eventId: true,
  companyId: true,
  attendeeName: true,
  attendeeEmail: true,
  licenseNumber: true,
  licenseType: true,
  licenseStates: true,
  deliveryMethod: true,
  quizResponses: true,
  score: true,
  passed: true,
  certPdfUrl: true,
  ceHours: true,
  attendedSessionIds: true,
  completedAt: true,
  issuedAt: true,
} satisfies Prisma.IssuedCertificateSelect;

type CertRow = Prisma.IssuedCertificateGetPayload<{ select: typeof CERT_SELECT }>;

type Resolved = {
  entry: Entry;
  passed: CertRow[];
  failed: CertRow[];
  keep: CertRow;
  plan: CertMergePlan;
  emailChanged: boolean;
  hasWork: boolean;
};

const sessionIdsOf = (row: CertRow): string[] =>
  Array.isArray(row.attendedSessionIds) ? (row.attendedSessionIds as string[]) : [];

async function resolveEntry(
  prisma: PrismaClient,
  entry: Entry,
  sessions: MergeSession[],
): Promise<Resolved> {
  const allowed = new Set(entry.emails.map((e) => e.toLowerCase()));
  const rows = await prisma.issuedCertificate.findMany({
    where: { id: { in: [...entry.passedCertIds, ...entry.failedCertIds] } },
    select: CERT_SELECT,
    orderBy: { issuedAt: "asc" },
  });
  for (const row of rows) {
    if (row.eventId !== EVENT_ID) throw new Error(`${entry.label}: cert ${row.id} is not on this event`);
    if (!allowed.has(row.attendeeEmail.toLowerCase())) {
      throw new Error(`${entry.label}: cert ${row.id} belongs to ${row.attendeeEmail}, which is not listed for this person`);
    }
    const expectPassed = entry.passedCertIds.includes(row.id);
    if (row.passed !== expectPassed) {
      throw new Error(`${entry.label}: cert ${row.id} has passed=${row.passed}, manifest expects ${expectPassed}`);
    }
  }
  const passed = rows.filter((r) => r.passed);
  const failed = rows.filter((r) => !r.passed);
  if (passed.length === 0) throw new Error(`${entry.label}: none of the listed passing certificates exist`);

  const plan = planCertMerge({
    sessions,
    certs: passed.map((r) => ({ id: r.id, passed: r.passed, attendedSessionIds: sessionIdsOf(r) })),
    addSessionIds: entry.addSessionIds,
  });
  const keep = passed.find((r) => r.id === plan.keepId)!;
  const emailChanged = keep.attendeeEmail.toLowerCase() !== entry.primaryEmail.toLowerCase();
  const hasWork = plan.absorbIds.length > 0 || failed.length > 0 || plan.contentChanged || emailChanged;
  return { entry, passed, failed, keep, plan, emailChanged, hasWork };
}

function printPlan(resolved: Resolved[], sessions: MergeSession[]): void {
  const pos = new Map(sessions.map((s) => [s.id, s.position + 1]));
  for (const r of resolved) {
    console.log(`\n${r.entry.label}${r.hasWork ? "" : "  (no change)"}`);
    if (!r.hasWork) continue;
    console.log(`  keep     ${r.keep.id}`);
    console.log(`  email    ${r.keep.attendeeEmail} -> ${r.entry.primaryEmail}${r.emailChanged ? "" : "  (unchanged)"}`);
    console.log(`  hours    ${Number(r.keep.ceHours ?? 0)} -> ${r.plan.ceHours}${r.plan.contentChanged ? "" : "  (unchanged)"}`);
    console.log(`  sessions ${r.plan.sessionIds.map((id) => pos.get(id)).join(", ")}`);
    for (const row of r.passed.filter((p) => p.id !== r.keep.id)) {
      console.log(`  delete   ${row.id}  ${row.attendeeEmail}  ${Number(row.ceHours ?? 0)} h (passing, refunds 1 credit)`);
    }
    for (const row of r.failed) {
      console.log(`  delete   ${row.id}  ${row.attendeeEmail}  failed attempt`);
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const sendEmails = args.includes("--send-emails");
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const only = onlyArg ? onlyArg.slice("--only=".length).toLowerCase() : null;
  if (apply && sendEmails) throw new Error("Run --apply first, check the result, then run --send-emails on its own.");

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (storage needs the service role).");
  }
  // Plain Storage REST calls, as in scripts/backfill-legacy-course-assets.ts.
  const storageHeaders = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
  const uploadPdf = async (path: string, body: Buffer): Promise<void> => {
    const res = await fetch(`${supabaseUrl}/storage/v1/object/${CERTS_BUCKET}/${path}`, {
      method: "POST",
      headers: { ...storageHeaders, "Content-Type": "application/pdf", "x-upsert": "true" },
      body: new Uint8Array(body),
    });
    if (!res.ok) throw new Error(`PDF upload failed (${path}): ${res.status} ${await res.text()}`);
  };
  const deletePdf = async (path: string): Promise<void> => {
    const res = await fetch(`${supabaseUrl}/storage/v1/object/${CERTS_BUCKET}/${path}`, {
      method: "DELETE",
      headers: storageHeaders,
    });
    // Already gone is fine: this step is re-runnable.
    if (!res.ok && res.status !== 404 && res.status !== 400) {
      throw new Error(`PDF delete failed (${path}): ${res.status} ${await res.text()}`);
    }
  };

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) });
  try {
    const mode = apply ? "APPLY" : sendEmails ? "SEND EMAILS" : "dry run";
    console.log(`Target DB: ${new URL(dbUrl).host}  |  mode: ${mode}`);

    const event = await prisma.event.findUniqueOrThrow({
      where: { id: EVENT_ID },
      select: {
        id: true,
        name: true,
        eventIdNumber: true,
        companyId: true,
        attendeeLinkToken: true,
        certsIssuedCount: true,
        sessions: {
          select: { id: true, name: true, durationHours: true, position: true },
          orderBy: { position: "asc" },
        },
      },
    });
    const sessions: MergeSession[] = event.sessions.map((s) => ({
      id: s.id,
      name: s.name ?? "",
      hours: Number(s.durationHours),
      position: s.position,
    }));

    const resolved: Resolved[] = [];
    for (const entry of MANIFEST) resolved.push(await resolveEntry(prisma, entry, sessions));

    const deletePassedIds = resolved.flatMap((r) => r.plan.absorbIds);
    const deleteFailedIds = resolved.flatMap((r) => r.failed.map((f) => f.id));
    const pending = resolved.filter((r) => r.hasWork);

    // A deleted certificate that someone already claimed into ProTrack would
    // orphan that ProTrack record (the FK is ON DELETE SET NULL). Refuse.
    const claimed = await prisma.ceCertificate.count({
      where: { issuedCertificateId: { in: deletePassedIds } },
    });
    if (claimed > 0) {
      throw new Error(`${claimed} certificate(s) marked for deletion are claimed in ProTrack. Resolve those by hand first.`);
    }

    printPlan(resolved, sessions);
    console.log(
      `\nTotals: ${deletePassedIds.length} passing certificate(s) to delete (credits returned), ` +
        `${deleteFailedIds.length} failed attempt(s) to delete, ${pending.length} person(s) with changes.`,
    );

    const renderFor = async (r: Resolved, row: CertRow): Promise<Buffer> =>
      renderEventCertificatePdf({
        attendeeName: row.attendeeName,
        eventName: event.name,
        eventIdNumber: event.eventIdNumber ?? "ACE-EVT",
        certificateId: row.id,
        ceHours: r.plan.ceHours,
        completedAt: row.completedAt ?? row.issuedAt,
        sessions: r.plan.sessionNames,
        sessionHours: r.plan.sessionHours,
        deliveryMethod: row.deliveryMethod,
        licenseNumber: row.licenseNumber,
      });

    if (!apply && !sendEmails) {
      console.log("\nDry run only. Re-run with --apply to write.");
      return;
    }

    if (apply) {
      const adminEmail = process.env.MERGE_ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
      const admin = await prisma.user.findUnique({
        where: { email: adminEmail },
        select: { id: true, staffRole: true },
      });
      if (!admin || admin.staffRole !== "ADMIN") throw new Error(`${adminEmail} is not an ADMIN account.`);

      if (pending.length > 0) {
        const backupPath = join(
          process.env.BACKUP_DIR ?? join(process.cwd(), "logic"),
          `smile-together-cert-merge-backup-${Date.now()}.json`,
        );
        writeFileSync(
          backupPath,
          JSON.stringify(resolved.flatMap((r) => [...r.passed, ...r.failed]), null, 2),
        );
        console.log(`\nBackup written: ${backupPath}`);

        await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`select id from public.companies where id = ${event.companyId}::uuid for update`;
          const company = await tx.company.findUniqueOrThrow({
            where: { id: event.companyId },
            select: { name: true, certBalance: true },
          });

          for (const r of pending) {
            await tx.issuedCertificate.update({
              where: { id: r.keep.id },
              data: {
                attendeeEmail: r.entry.primaryEmail.toLowerCase(),
                attendedSessionIds: r.plan.sessionIds as unknown as Prisma.InputJsonValue,
                ceHours: new Prisma.Decimal(r.plan.ceHours),
                score: r.plan.score,
              },
            });
          }

          const removedFailed = await tx.issuedCertificate.deleteMany({
            where: { id: { in: deleteFailedIds }, eventId: EVENT_ID, passed: false },
          });
          const removedPassed = await tx.issuedCertificate.deleteMany({
            where: { id: { in: deletePassedIds }, eventId: EVENT_ID, passed: true },
          });
          if (removedPassed.count !== deletePassedIds.length || removedFailed.count !== deleteFailedIds.length) {
            throw new Error("Row counts changed since the plan was built. Nothing was written; re-run the dry run.");
          }

          // Refund exactly what was deleted in THIS transaction.
          const delta = removedPassed.count;
          if (delta > 0) {
            const v = validateCertBalanceAdjustment(delta, company.certBalance);
            if (!v.ok) throw new Error(`Credit refund rejected: ${v.error}`);
            await tx.company.update({
              where: { id: event.companyId },
              data: { certBalance: { increment: delta }, totalCertsIssued: { decrement: delta } },
            });
            await tx.event.update({
              where: { id: EVENT_ID },
              data: { certsIssuedCount: { decrement: delta } },
            });
            await tx.billingTransaction.create({
              data: {
                companyId: event.companyId,
                type: BillingTransactionType.ADMIN_OVERRIDE_CERTS,
                quantity: delta,
                amountCents: 0,
                performedById: admin.id,
              },
            });
            // Same row shape as recordAdminAction (lib/admin/audit.ts), which
            // cannot be imported here: it loads the app Prisma client.
            await tx.adminAuditLog.create({
              data: {
                actorUserId: admin.id,
                targetUserId: null,
                action: AdminAuditAction.COMPANY_BALANCE_ADJUSTED,
                summary: balanceAdjustmentSummary({
                  field: "certBalance",
                  delta,
                  before: company.certBalance,
                  companyName: company.name,
                }),
                details: {
                  reason: "Duplicate event certificates merged onto one email (scripts/merge-smile-together-certs.ts)",
                  eventId: EVENT_ID,
                  deletedCertificateIds: deletePassedIds,
                  keptCertificateIds: pending.map((r) => r.keep.id),
                },
              },
            });
          }
          console.log(
            `Applied: ${pending.length} certificate(s) updated, ${removedPassed.count} passing + ${removedFailed.count} failed row(s) deleted, ${delta} credit(s) returned.`,
          );
        });

        for (const id of deletePassedIds) await deletePdf(`${id}.pdf`);
        console.log(`Removed ${deletePassedIds.length} superseded PDF(s) from storage.`);
      } else {
        console.log("\nNo database changes pending.");
      }

      // Re-render from current rows for everyone flagged notify. Deterministic
      // and upsert, so a re-run after a failed upload simply finishes the job.
      for (const entry of MANIFEST.filter((e) => e.notify)) {
        const r = await resolveEntry(prisma, entry, sessions);
        const pdf = await renderFor(r, r.keep);
        await uploadPdf(`${r.keep.id}.pdf`, pdf);
        await prisma.issuedCertificate.update({
          where: { id: r.keep.id },
          data: { certPdfUrl: `${r.keep.id}.pdf` },
        });
        console.log(`PDF rendered: ${entry.label} (${r.plan.ceHours} h, ${pdf.length} bytes)`);
      }
      return;
    }

    // --send-emails
    if (pending.length > 0) throw new Error("There are unapplied changes. Run --apply first.");
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not set");
    const resend = new Resend(apiKey);
    const from = process.env.RESEND_FROM_EMAIL ?? "noreply@dentalace.org";
    const recipients = MANIFEST.filter(
      (e) => e.notify && (only === null || e.primaryEmail.toLowerCase() === only),
    );
    if (recipients.length === 0) throw new Error("No recipients match.");

    let checkedClaimLink = false;
    for (const entry of recipients) {
      const r = await resolveEntry(prisma, entry, sessions);
      const row = r.keep;
      const claimUrl = `${BASE_URL}/api/protrack/claim-certificate?token=${signCertClaimToken(row.id)}`;

      // The token is signed with the LOCAL SESSION_SECRET. Production rejects
      // it (redirect to /login?error=cert_claim) if the secrets differ, so
      // prove one link before anything is sent. A valid link behaves exactly
      // as it would when the attendee clicks it.
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

      const completedAt = row.completedAt ?? row.issuedAt;
      const props = {
        attendeeName: row.attendeeName,
        courseTitle: event.name,
        courseIdNumber: event.eventIdNumber ?? "ACE-EVT",
        certificateId: row.id,
        ceHours: r.plan.ceHours,
        completedAt: completedAt.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        }),
        verifyUrl: `${BASE_URL}/attend/event/${event.attendeeLinkToken}`,
        claimUrl,
        replacesPrevious: true,
      };
      const pdf = await renderFor(r, row);
      const { error } = await resend.emails.send({
        from,
        to: entry.primaryEmail,
        subject: CertificateIssuedEmail.subject(props),
        react: CertificateIssuedEmail(props),
        attachments: [{ filename: `${event.eventIdNumber ?? "event"}-certificate.pdf`, content: pdf }],
      });
      if (error) throw new Error(`Send failed for ${entry.primaryEmail}: ${error.message}. Retry with --only=${entry.primaryEmail}`);
      console.log(`Sent: ${entry.label} <${entry.primaryEmail}>  ${r.plan.ceHours} h`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
