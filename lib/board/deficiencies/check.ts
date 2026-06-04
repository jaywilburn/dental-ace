import "server-only";
import {
  DeficiencyStatus,
  ComplianceStatus,
  VerificationStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  computeRequirementProgress,
  parseCategories,
} from "@/lib/protrack/progress";

/*
  Recompute a deficiency's compliance state from the licensee's current
  verified CeCertificates and the matching StateRequirement. Used by:
   - the daily cron (verify-deficiency-check)
   - a manual "recheck" button on /board/deficiencies (follow-up commit)

  Returns the new status. The function mutates the row when the status
  changes (PENDING → RESOLVED, or its missing-hours snapshot drifts).
  Idempotent: a second call with no changes is a no-op.
*/

const VERIFIED_STATUSES: VerificationStatus[] = [
  VerificationStatus.AUTO,
  VerificationStatus.ADA_CERP_ACCEPTED,
  VerificationStatus.AGD_PACE_ACCEPTED,
  VerificationStatus.ADMIN_VERIFIED,
];

export type RecheckOutcome =
  | { status: "not_found" }
  | { status: "skipped"; reason: "not_pending" }
  | { status: "still_pending"; missingHours: number; missingCategories: string[] }
  | { status: "resolved" };

export async function recheckDeficiency(
  deficiencyId: string,
): Promise<RecheckOutcome> {
  const def = await prisma.deficiency.findUnique({
    where: { id: deficiencyId },
    select: {
      id: true,
      status: true,
      userLicense: {
        select: {
          id: true,
          licenseeId: true,
          licenseType: true,
          state: true,
        },
      },
    },
  });
  if (!def) return { status: "not_found" };
  if (def.status !== DeficiencyStatus.PENDING) {
    return { status: "skipped", reason: "not_pending" };
  }

  const requirement = await prisma.stateRequirement.findUnique({
    where: {
      state_licenseType: {
        state: def.userLicense.state,
        licenseType: def.userLicense.licenseType,
      },
    },
    select: { totalHours: true, categories: true },
  });

  const certs = await prisma.ceCertificate.findMany({
    where: {
      licenseeId: def.userLicense.licenseeId,
      verificationStatus: { in: VERIFIED_STATUSES },
    },
    select: { category: true, hours: true, deliveryFormat: true },
  });

  const totalRequired = requirement ? Number(requirement.totalHours) : 0;
  const categories = requirement ? parseCategories(requirement.categories) : [];

  const progress = computeRequirementProgress(
    { totalHours: totalRequired, categories },
    certs.map((c) => ({
      category: c.category,
      hours: Number(c.hours),
      deliveryFormat: c.deliveryFormat,
    })),
  );

  const newCompliant = progress.totalEarned >= totalRequired && totalRequired > 0;
  const missingHours = progress.remaining;
  const missingCategories = progress.categories
    .filter((c) => c.needed > 0)
    .map((c) => c.name);

  if (newCompliant) {
    await prisma.deficiency.update({
      where: { id: def.id },
      data: {
        status: DeficiencyStatus.RESOLVED,
        resolvedAt: new Date(),
        missingHours: new Prisma.Decimal(0),
        missingCategories: [] as Prisma.InputJsonValue,
      },
    });
    return { status: "resolved" };
  }

  await prisma.deficiency.update({
    where: { id: def.id },
    data: {
      missingHours: new Prisma.Decimal(missingHours),
      missingCategories: missingCategories as Prisma.InputJsonValue,
    },
  });
  return { status: "still_pending", missingHours, missingCategories };
}
