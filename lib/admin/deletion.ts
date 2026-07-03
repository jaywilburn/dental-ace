import "server-only";
import { prisma } from "@/lib/prisma";
import type { DeletionFacts } from "@/lib/admin/deletion-rules";

/*
  Server-only. Turns a user id into the facts evaluateDeletable() needs. Runs
  its own focused queries so both the deleteAccount action and the user-detail
  page can call it without threading a pre-loaded user object. Each block below
  maps to one guard in the design spec dated 2026-07-01.
*/
export async function gatherDeletionFacts(
  userId: string,
  actingAdminId: string,
): Promise<DeletionFacts> {
  const [
    target,
    adminActions,
    initiatedAudits,
    auditSelections,
    deficiencies,
    proSubs,
    ceCerts,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { staffRole: true, companyId: true },
    }),
    prisma.adminAuditLog.count({ where: { actorUserId: userId } }),
    prisma.auditBatch.count({ where: { initiatedById: userId } }),
    prisma.auditSelection.count({ where: { userLicense: { licenseeId: userId } } }),
    prisma.deficiency.count({ where: { userLicense: { licenseeId: userId } } }),
    prisma.proSubscription.count({ where: { licenseeId: userId } }),
    prisma.ceCertificate.count({ where: { licenseeId: userId } }),
  ]);

  const companyId = target?.companyId ?? null;
  let companyHasActivity = false;
  if (companyId) {
    const [apps, courses, issued, billing] = await Promise.all([
      prisma.courseApplication.count({ where: { companyId, status: { not: "DRAFT" } } }),
      prisma.accreditedCourse.count({ where: { companyId } }),
      prisma.issuedCertificate.count({ where: { companyId } }),
      prisma.billingTransaction.count({ where: { companyId } }),
    ]);
    companyHasActivity = apps + courses + issued + billing > 0;
  }

  return {
    isSelf: userId === actingAdminId,
    isAdmin: target?.staffRole === "ADMIN",
    hasPerformedAdminActions: adminActions > 0,
    hasInitiatedAudits: initiatedAudits > 0,
    isUnderAudit: auditSelections + deficiencies > 0,
    hasProSubscription: proSubs > 0,
    hasCeCertificates: ceCerts > 0,
    companyHasActivity,
  };
}
