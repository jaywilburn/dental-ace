import "server-only";
import {
  ComplianceStatus,
  LicenseType,
  VerificationStatus,
  type StateRequirement,
  type DeliveryFormat,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  computeRequirementProgress,
  parseCategories,
  type RequirementProgress,
} from "@/lib/protrack/progress";

/*
  Shared CE-compliance computation for the board's licensee views.

  - Used by /board/licensees (list — batch-computed) and
    /board/licensees/[licenseNumber] (detail — single licensee with full
    progress shape).
  - Mirrors the classification rule from lib/board/audits/run.ts so the
    statuses surfaced on the licensee list match what a fresh audit would
    record. Keep these in sync.
  - "Verified" certificates are the same four statuses the audit considers
    authoritative: AUTO (ACE-synced), the two CE-provider accepted lanes,
    and admin-verified uploads.
*/

const VERIFIED_STATUSES: VerificationStatus[] = [
  VerificationStatus.AUTO,
  VerificationStatus.ADA_CERP_ACCEPTED,
  VerificationStatus.AGD_PACE_ACCEPTED,
  VerificationStatus.ADMIN_VERIFIED,
];

export type LicenseeListRow = {
  userLicenseId: string;
  licenseeId: string;
  licenseNumber: string;
  licenseType: LicenseType;
  renewalDate: Date;
  firstName: string | null;
  lastName: string | null;
  email: string;
  ceHoursCompleted: number;
  ceHoursRequired: number;
  complianceStatus: ComplianceStatus;
};

export type CertForProgress = {
  category: string;
  hours: number;
  deliveryFormat: DeliveryFormat | null;
};

function classify(
  totalEarned: number,
  totalRequired: number,
): ComplianceStatus {
  if (totalEarned >= totalRequired) return ComplianceStatus.COMPLIANT;
  if (totalEarned === 0) return ComplianceStatus.NO_UPLOAD;
  if (totalEarned >= totalRequired / 2) return ComplianceStatus.IN_PROGRESS;
  return ComplianceStatus.DEFICIENT;
}

function reqProgress(
  requirement: StateRequirement | undefined,
  certs: CertForProgress[],
): RequirementProgress {
  const totalRequired = requirement ? Number(requirement.totalHours) : 0;
  const categories = requirement ? parseCategories(requirement.categories) : [];
  return computeRequirementProgress(
    { totalHours: totalRequired, categories },
    certs,
  );
}

/**
 * Compute compliance for every UserLicense in `licenses` against the matching
 * StateRequirement. Two batched queries (requirements + verified certs) — no
 * N+1.
 */
export async function computeLicenseeComplianceBatch(
  state: string,
  licenses: Array<{
    id: string;
    licenseeId: string;
    licenseType: LicenseType;
    licenseNumber: string;
    renewalDate: Date;
    user: {
      firstName: string | null;
      lastName: string | null;
      email: string;
    };
  }>,
): Promise<LicenseeListRow[]> {
  if (licenses.length === 0) return [];

  const types = Array.from(new Set(licenses.map((l) => l.licenseType)));
  const licenseeIds = Array.from(new Set(licenses.map((l) => l.licenseeId)));

  const [requirements, certs] = await Promise.all([
    prisma.stateRequirement.findMany({
      where: { state, licenseType: { in: types } },
    }),
    prisma.ceCertificate.findMany({
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
    }),
  ]);

  const reqByType = new Map(requirements.map((r) => [r.licenseType, r]));
  const certsByLicensee = new Map<string, CertForProgress[]>();
  for (const c of certs) {
    const list = certsByLicensee.get(c.licenseeId) ?? [];
    list.push({
      category: c.category,
      hours: Number(c.hours),
      deliveryFormat: c.deliveryFormat,
    });
    certsByLicensee.set(c.licenseeId, list);
  }

  return licenses.map((l) => {
    const requirement = reqByType.get(l.licenseType);
    const progress = reqProgress(
      requirement,
      certsByLicensee.get(l.licenseeId) ?? [],
    );
    return {
      userLicenseId: l.id,
      licenseeId: l.licenseeId,
      licenseNumber: l.licenseNumber,
      licenseType: l.licenseType,
      renewalDate: l.renewalDate,
      firstName: l.user.firstName,
      lastName: l.user.lastName,
      email: l.user.email,
      ceHoursCompleted: progress.totalEarned,
      ceHoursRequired: progress.totalRequired,
      complianceStatus: classify(progress.totalEarned, progress.totalRequired),
    };
  });
}

export type LicenseeDetail = {
  license: {
    id: string;
    licenseeId: string;
    licenseNumber: string;
    licenseType: LicenseType;
    state: string;
    renewalDate: Date;
    isPrimary: boolean;
  };
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    protrackTier: string;
    createdAt: Date;
  };
  requirement: StateRequirement | null;
  progress: RequirementProgress;
  complianceStatus: ComplianceStatus;
  verifiedCertCount: number;
  unverifiedCertCount: number;
};

/**
 * Resolve one licensee's full compliance picture, scoped to the board's
 * state. Returns null when no license with that number exists in the state
 * (the caller renders a 404).
 *
 * Cross-tenant safety: the state filter is mandatory. A TX board user
 * cannot resolve a CA license even by guessing its number.
 */
export async function getLicenseeDetail(
  state: string,
  licenseNumber: string,
): Promise<LicenseeDetail | null> {
  const license = await prisma.userLicense.findFirst({
    where: { state, licenseNumber },
    select: {
      id: true,
      licenseeId: true,
      licenseNumber: true,
      licenseType: true,
      state: true,
      renewalDate: true,
      isPrimary: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          protrackTier: true,
          createdAt: true,
        },
      },
    },
  });
  if (!license) return null;

  const [requirement, allCerts] = await Promise.all([
    prisma.stateRequirement.findUnique({
      where: {
        state_licenseType: { state, licenseType: license.licenseType },
      },
    }),
    prisma.ceCertificate.findMany({
      where: { licenseeId: license.licenseeId },
      orderBy: { completedAt: "desc" },
      select: {
        verificationStatus: true,
        category: true,
        hours: true,
        deliveryFormat: true,
      },
    }),
  ]);

  const verified = allCerts.filter((c) =>
    VERIFIED_STATUSES.includes(c.verificationStatus),
  );
  const progress = reqProgress(
    requirement ?? undefined,
    verified.map((c) => ({
      category: c.category,
      hours: Number(c.hours),
      deliveryFormat: c.deliveryFormat,
    })),
  );

  return {
    license: {
      id: license.id,
      licenseeId: license.licenseeId,
      licenseNumber: license.licenseNumber,
      licenseType: license.licenseType,
      state: license.state,
      renewalDate: license.renewalDate,
      isPrimary: license.isPrimary,
    },
    user: {
      id: license.user.id,
      firstName: license.user.firstName,
      lastName: license.user.lastName,
      email: license.user.email,
      protrackTier: license.user.protrackTier,
      createdAt: license.user.createdAt,
    },
    requirement,
    progress,
    complianceStatus: classify(progress.totalEarned, progress.totalRequired),
    verifiedCertCount: verified.length,
    unverifiedCertCount: allCerts.length - verified.length,
  };
}
