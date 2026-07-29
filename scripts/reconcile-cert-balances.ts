/*
  Reconcile the cert balance of migrated legacy providers against the migration
  spreadsheet.

  Background: scripts/migrate-legacy.ts imported all 39 legacy CE-provider
  companies with cert_balance = 0 (and total_certs_issued = the count of their
  imported certificate rows, which is already correct and NOT touched here). The
  client is now crediting each provider the certificate balance they are owed per
  the original migration spreadsheet — an "available to send" figure that is NOT
  derivable from our data (e.g. Curve Dental was granted 570, Dana Watson 31,
  neither of which equals their issued count). This script applies those grants in
  bulk, using the exact same safety pattern as the admin UI
  (lib/admin/billing-overrides.ts → adjustCertBalance): a row-locked transaction,
  the shared validator, and an append-only ADMIN_OVERRIDE billing_transactions row
  attributed to a real admin.

  Targets are ABSOLUTE balances, so the run is idempotent: re-running after apply
  yields delta 0 for every already-correct company. Matching is on legacy_id (the
  stable provenance key on companies.legacy_id).

  Usage:
    pnpm reconcile:certs                      dry run (default): print the diff, write nothing
    pnpm reconcile:certs --apply              apply grants (delta > 0)
    pnpm reconcile:certs --apply --allow-decrease   also apply reductions (delta < 0)
    pnpm reconcile:certs --file=path/to.csv   use a different targets file

  Input CSV (default scripts/data/legacy/cert-balance-targets.csv):
    legacy_id,name,target_cert_balance
    1,"Pearl, Inc.",<owed balance from the spreadsheet>

  The performing admin is resolved from RECONCILE_ADMIN_EMAIL (default
  john@dentalace.org) so the ledger entries match the UI-driven grants. Required
  for --apply; a dry run works without it.
*/
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, BillingTransactionType } from "@prisma/client";
import { validateCertBalanceAdjustment } from "../lib/admin/override-rules";

config({ path: ".env.local" });

const DEFAULT_TARGETS = join(process.cwd(), "scripts", "data", "legacy", "cert-balance-targets.csv");
const DEFAULT_ADMIN_EMAIL = "john@dentalace.org";

type TargetRow = { legacyId: number; name: string; target: number };

// ---------------------------------------------------------------------------
// CSV parsing (no dependency). Matching is on the numeric first/last column, so
// a comma inside a quoted name — "Pearl, Inc." — is handled without a full parser.
// ---------------------------------------------------------------------------

function parseTargetsCsv(path: string): TargetRow[] {
  const text = readFileSync(path, "utf8");
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  if (lines.length === 0) throw new Error(`No data rows in ${path}`);

  // Drop a header row if the first line's first cell isn't a number.
  const rows = /^\d+\s*,/.test(lines[0]) ? lines : lines.slice(1);
  if (rows.length === 0) throw new Error(`No data rows in ${path} (only a header?)`);

  return rows.map((line, i) => {
    const first = line.indexOf(",");
    const last = line.lastIndexOf(",");
    if (first === -1 || first === last) {
      throw new Error(`Row ${i + 1} must have 3 columns (legacy_id,name,target_cert_balance): "${line}"`);
    }
    const legacyId = Number(line.slice(0, first).trim());
    const target = Number(line.slice(last + 1).trim());
    let name = line.slice(first + 1, last).trim();
    if (name.startsWith('"') && name.endsWith('"')) name = name.slice(1, -1);

    if (!Number.isInteger(legacyId) || legacyId <= 0) {
      throw new Error(`Row ${i + 1}: bad legacy_id in "${line}"`);
    }
    if (!Number.isInteger(target) || target < 0) {
      throw new Error(`Row ${i + 1}: target_cert_balance must be a whole number >= 0 in "${line}"`);
    }
    return { legacyId, name, target };
  });
}

// ---------------------------------------------------------------------------

type Action = "ok" | "grant" | "reduce" | "skip-decrease" | "missing" | "invalid";

type PlanRow = {
  legacyId: number;
  csvName: string;
  dbName: string | null;
  current: number | null;
  target: number;
  delta: number;
  action: Action;
  note: string;
};

function pad(s: string | number, w: number): string {
  const str = String(s);
  return str.length >= w ? str : str + " ".repeat(w - str.length);
}

function classify(current: number, target: number, allowDecrease: boolean): { action: Action; note: string } {
  const delta = target - current;
  if (delta === 0) return { action: "ok", note: "already at target" };
  if (delta > 0) {
    const v = validateCertBalanceAdjustment(delta, current);
    return v.ok ? { action: "grant", note: `+${delta}` } : { action: "invalid", note: v.error };
  }
  // delta < 0
  if (!allowDecrease) return { action: "skip-decrease", note: "current > target; pass --allow-decrease to reduce" };
  const v = validateCertBalanceAdjustment(delta, current);
  return v.ok ? { action: "reduce", note: `${delta}` } : { action: "invalid", note: v.error };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const allowDecrease = args.includes("--allow-decrease");
  const fileArg = args.find((a) => a.startsWith("--file="));
  const targetsPath = fileArg ? fileArg.slice("--file=".length) : DEFAULT_TARGETS;
  const adminEmail = process.env.RECONCILE_ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  const host = (() => {
    try {
      return new URL(dbUrl).host;
    } catch {
      return "unknown";
    }
  })();

  const targets = parseTargetsCsv(targetsPath);
  const seen = new Set<number>();
  for (const t of targets) {
    if (seen.has(t.legacyId)) throw new Error(`Duplicate legacy_id ${t.legacyId} in ${targetsPath}`);
    seen.add(t.legacyId);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) });
  try {
    console.log(`Target DB: ${host}  |  targets: ${targetsPath}  |  mode: ${apply ? "APPLY" : "dry run"}`);

    // Resolve the accountable admin (required for --apply).
    const admin = await prisma.user.findUnique({
      where: { email: adminEmail },
      select: { id: true, email: true, staffRole: true },
    });
    if (apply) {
      if (!admin) throw new Error(`Admin ${adminEmail} not found. Set RECONCILE_ADMIN_EMAIL to a real admin.`);
      if (admin.staffRole !== "ADMIN") throw new Error(`${adminEmail} is not an ADMIN (staffRole=${admin.staffRole}).`);
    }
    console.log(`Performed by: ${admin ? `${admin.email} (${admin.staffRole})` : `${adminEmail} — NOT FOUND (dry run only)`}\n`);

    // Build the plan (read-only).
    const plan: PlanRow[] = [];
    for (const t of targets) {
      const company = await prisma.company.findUnique({
        where: { legacyId: t.legacyId },
        select: { id: true, name: true, certBalance: true },
      });
      if (!company) {
        plan.push({ legacyId: t.legacyId, csvName: t.name, dbName: null, current: null, target: t.target, delta: 0, action: "missing", note: "no company with this legacy_id" });
        continue;
      }
      const { action, note } = classify(company.certBalance, t.target, allowDecrease);
      const nameNote = t.name && company.name !== t.name ? ` [csv name "${t.name}" != db "${company.name}"]` : "";
      plan.push({
        legacyId: t.legacyId,
        csvName: t.name,
        dbName: company.name,
        current: company.certBalance,
        target: t.target,
        delta: t.target - company.certBalance,
        action,
        note: note + nameNote,
      });
    }

    // Print the diff table.
    console.log(`${pad("legacyId", 9)}${pad("company", 40)}${pad("current", 9)}${pad("target", 8)}${pad("delta", 8)}action`);
    console.log("-".repeat(90));
    for (const r of plan) {
      const name = (r.dbName ?? r.csvName).slice(0, 38);
      console.log(
        `${pad(r.legacyId, 9)}${pad(name, 40)}${pad(r.current ?? "-", 9)}${pad(r.target, 8)}${pad(r.delta, 8)}${r.action}  ${r.note}`,
      );
    }

    const grants = plan.filter((r) => r.action === "grant");
    const reduces = plan.filter((r) => r.action === "reduce");
    const actionable = [...grants, ...reduces];
    const problems = plan.filter((r) => r.action === "missing" || r.action === "invalid" || r.action === "skip-decrease");

    console.log(
      `\nSummary: ${plan.length} rows · ${plan.filter((r) => r.action === "ok").length} already correct · ` +
        `${grants.length} to grant (+${grants.reduce((s, r) => s + r.delta, 0)}) · ` +
        `${reduces.length} to reduce (${reduces.reduce((s, r) => s + r.delta, 0)}) · ${problems.length} needs attention`,
    );
    if (problems.length) {
      console.log("Needs attention:");
      for (const r of problems) console.log(`  legacyId ${r.legacyId} (${r.dbName ?? r.csvName}): ${r.action} — ${r.note}`);
    }

    if (!apply) {
      console.log(`\nDry run — nothing written. Re-run with --apply to commit ${actionable.length} change(s).`);
      return;
    }
    if (actionable.length === 0) {
      console.log("\nNothing to apply.");
      return;
    }

    // Apply each change in its own row-locked transaction, mirroring adjustCertBalance.
    let applied = 0;
    for (const r of actionable) {
      const company = await prisma.company.findUnique({ where: { legacyId: r.legacyId }, select: { id: true } });
      if (!company) {
        console.log(`  ! legacyId ${r.legacyId} vanished before apply — skipped`);
        continue;
      }
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`select id from public.companies where id = ${company.id}::uuid for update`;
        const locked = await tx.company.findUniqueOrThrow({ where: { id: company.id }, select: { certBalance: true } });
        // Recompute against the locked balance so we always converge on the absolute target (idempotent under concurrency).
        const delta = r.target - locked.certBalance;
        if (delta === 0) return; // someone else already reconciled this one
        if (delta < 0 && !allowDecrease) return;
        const v = validateCertBalanceAdjustment(delta, locked.certBalance);
        if (!v.ok) {
          console.log(`  ! legacyId ${r.legacyId}: ${v.error} — skipped`);
          return;
        }
        await tx.company.update({ where: { id: company.id }, data: { certBalance: { increment: delta } } });
        await tx.billingTransaction.create({
          data: {
            companyId: company.id,
            type: BillingTransactionType.ADMIN_OVERRIDE_CERTS,
            quantity: delta,
            amountCents: 0,
            performedById: admin!.id,
          },
        });
        applied++;
        console.log(`  ✓ legacyId ${r.legacyId} (${r.dbName}): ${locked.certBalance} → ${locked.certBalance + delta}  (${delta > 0 ? "+" : ""}${delta})`);
      });
    }
    console.log(`\nApplied ${applied} change(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
