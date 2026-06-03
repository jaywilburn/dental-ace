"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  Prisma,
  LicenseType,
  ComplianceStatus,
  VerificationStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireBoard } from "@/lib/board/scope";
import {
  computeRequirementProgress,
  parseCategories,
} from "@/lib/protrack/progress";
import { runAuditSchema } from "@/lib/board/audits/schema";

/*
  Run a random audit. Pure data flow:

  1. Resolve the board (requireBoard).
  2. Find eligible UserLicense rows: state = board.state, optional license_type
     filter. Pull each licensee's verified CeCertificates in one shot.
  3. Compute compliance per licensee using the existing
     `computeRequirementProgress` helper, against the matching StateRequirement.
  4. Random-select N% via Fisher–Yates.
  5. In a tx with `pg_advisory_xact_lock(state)`: next batch counter for the
     board's state-year, create audit_batches, bulk-insert audit_selections,
     bulk-insert deficiencies for non-compliant rows. Sequence safety is the
     advisory lock + a unique batch_code constraint.

  Notes / future work:
   - The `renewalCycle` input is stored on the batch as a label only — we don't
     filter eligible licensees by renewal year today. Plan §"Out of scope"
     accepts this; tighten when cycle semantics are confirmed.
   - The cert count per licensee is bounded (≤ 12 in seed; production caps
     itself via the user upload UI), so streaming/pagination isn't needed yet.
*/

const ALL_LICENSE_TYPES = [
  LicenseType.DDS_DMD,
  LicenseType.RDH,
  LicenseType.DA,
] as const;

function fisherYates<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i]!, out[j]!] = [out[j]!, out[i]!];
  }
  return out;
}

function classify(
  totalEarned: number,
  totalRequired: number,
): ComplianceStatus {
  if (totalEarned >= totalRequired) return ComplianceStatus.COMPLIANT;
  if (totalEarned === 0) return ComplianceStatus.NO_UPLOAD;
  if (totalEarned >= totalRequired / 2) return ComplianceStatus.IN_PROGRESS;
  return ComplianceStatus.DEFICIENT;
}

const VERIFIED_STATUSES: VerificationStatus[] = [
  VerificationStatus.AUTO,
  VerificationStatus.ADA_CERP_ACCEPTED,
  VerificationStatus.AGD_PACE_ACCEPTED,
  VerificationStatus.ADMIN_VERIFIED,
];

function stateLockKey(state: string): bigint {
  // Mirror the lock used in /api/auth/register-board so all per-state writes
  // (board creation, batch sequence generation) serialize on the same key.
  // Stable hash of the 2-char state code.
  const code = state.charCodeAt(0) * 256 + (state.charCodeAt(1) ?? 0);
  // Spread into a 64-bit number; bigint cast is required by Prisma's template tag.
  return BigInt(code) * BigInt("0xdeadbeef");
}

export async function runAudit(formData: FormData): Promise<void> {
  const { user, board } = await requireBoard();

  const parsed = runAuditSchema.safeParse({
    samplePercent: formData.get("samplePercent"),
    licenseType: formData.get("licenseType"),
    renewalCycle: formData.get("renewalCycle"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Check the audit settings.";
    redirect(`/board/audits/new?error=${encodeURIComponent(msg)}`);
  }
  const input = parsed.data;
  const licenseTypeFilter =
    input.licenseType === "ALL" ? null : input.licenseType;

  // 1. Eligible UserLicense rows for the board's state.
  const eligible = await prisma.userLicense.findMany({
    where: {
      state: board.state,
      ...(licenseTypeFilter ? { licenseType: licenseTypeFilter } : {}),
    },
    select: {
      id: true,
      licenseeId: true,
      licenseType: true,
      renewalDate: true,
    },
  });

  if (eligible.length === 0) {
    redirect(
      `/board/audits/new?error=${encodeURIComponent(
        "No licensees match those filters yet. Try a different license type.",
      )}`,
    );
  }

  // 2. Random-select N%, rounded up so a 10% audit of 5 still picks at least 1.
  const sampleSize = Math.max(
    1,
    Math.ceil((eligible.length * input.samplePercent) / 100),
  );
  const shuffled = fisherYates(eligible);
  const selected = shuffled.slice(0, sampleSize);

  // 3. Pull StateRequirements + verified certs for the selected licensees.
  //    Two batched queries beat N+1 per licensee.
  const requirements = await prisma.stateRequirement.findMany({
    where: {
      state: board.state,
      licenseType: { in: [...ALL_LICENSE_TYPES] },
    },
  });
  const reqByType = new Map(requirements.map((r) => [r.licenseType, r]));

  const licenseeIds = Array.from(new Set(selected.map((s) => s.licenseeId)));
  const certs = await prisma.ceCertificate.findMany({
    where: {
      licenseeId: { in: licenseeIds },
      verificationStatus: { in: VERIFIED_STATUSES },
    },
    select: {
      licenseeId: true,
      category: true,
      hours: true,
      deliveryFormat: true,
    },
  });
  const certsByLicensee = new Map<string, typeof certs>();
  for (const c of certs) {
    const list = certsByLicensee.get(c.licenseeId) ?? [];
    list.push(c);
    certsByLicensee.set(c.licenseeId, list);
  }

  // 4. Compute compliance per selection.
  type SelectionRow = {
    userLicenseId: string;
    licenseeId: string;
    ceHoursCompleted: number;
    ceHoursRequired: number;
    complianceStatus: ComplianceStatus;
    missingHours: number;
    missingCategories: string[];
  };

  const rows: SelectionRow[] = selected.map((sel) => {
    const requirement = reqByType.get(sel.licenseType);
    const totalRequired = requirement
      ? Number(requirement.totalHours)
      : 0;
    const categories = requirement
      ? parseCategories(requirement.categories)
      : [];

    const licenseeCerts = (certsByLicensee.get(sel.licenseeId) ?? []).map(
      (c) => ({
        category: c.category,
        hours: Number(c.hours),
        deliveryFormat: c.deliveryFormat,
      }),
    );

    const progress = computeRequirementProgress(
      { totalHours: totalRequired, categories },
      licenseeCerts,
    );

    const status = classify(progress.totalEarned, totalRequired);
    const missingCategories = progress.categories
      .filter((c) => c.needed > 0)
      .map((c) => c.name);

    return {
      userLicenseId: sel.id,
      licenseeId: sel.licenseeId,
      ceHoursCompleted: progress.totalEarned,
      ceHoursRequired: totalRequired,
      complianceStatus: status,
      missingHours: progress.remaining,
      missingCategories,
    };
  });

  const deficientRows = rows.filter(
    (r) => r.complianceStatus !== ComplianceStatus.COMPLIANT,
  );

  // 5. Persist in a tx behind the per-state advisory lock so the batch_code
  //    sequence per (board, year) is race-safe.
  const year = new Date().getFullYear();
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(${stateLockKey(board.state)})`;

    const prefix = `${board.state}-${year}-`;
    const lastBatch = await tx.auditBatch.findFirst({
      where: { boardId: board.id, batchCode: { startsWith: prefix } },
      orderBy: { batchCode: "desc" },
      select: { batchCode: true },
    });
    const lastSeq = lastBatch
      ? Number(lastBatch.batchCode.split("-").at(-1) ?? 0)
      : 0;
    const seq = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
    const batchCode = `${prefix}${String(seq).padStart(3, "0")}`;

    const batch = await tx.auditBatch.create({
      data: {
        boardId: board.id,
        batchCode,
        name: input.name,
        samplePercent: input.samplePercent,
        licenseType: licenseTypeFilter,
        renewalCycle: input.renewalCycle,
        selectedCount: rows.length,
        deficientCount: deficientRows.length,
        initiatedById: user.id,
      },
      select: { id: true },
    });

    if (rows.length > 0) {
      await tx.auditSelection.createMany({
        data: rows.map((r) => ({
          batchId: batch.id,
          userLicenseId: r.userLicenseId,
          ceHoursCompleted: new Prisma.Decimal(r.ceHoursCompleted),
          ceHoursRequired: new Prisma.Decimal(r.ceHoursRequired),
          complianceStatus: r.complianceStatus,
        })),
      });
    }

    if (deficientRows.length > 0) {
      await tx.deficiency.createMany({
        data: deficientRows.map((r) => ({
          batchId: batch.id,
          userLicenseId: r.userLicenseId,
          missingHours: new Prisma.Decimal(r.missingHours),
          missingCategories: r.missingCategories as Prisma.InputJsonValue,
        })),
      });
    }

    return { batchId: batch.id };
  });

  revalidatePath("/board");
  revalidatePath("/board/audits");
  revalidatePath("/board/deficiencies");
  redirect(`/board/audits/${result.batchId}`);
}
