"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { LicenseType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { JURISDICTION_CODES } from "@/lib/protrack/reference";

/*
  Add an additional state license. Multi-state tracking is included in the Free
  tier (client June 2026); a soft cap keeps any one account from creating an
  unreasonable number of license rows.

  SECURITY: this does NOT trigger an ACE certificate backfill. Auto-sync matches
  by account email, which is not verified at sign-up (email_confirm=true), so
  syncing here would let a squatted-email account harvest another person's CE
  history. Backfill is deferred until email verification is live (see the
  SECURITY note in lib/protrack/ace-sync.ts).
*/

const LICENSE_TYPES: LicenseType[] = [
  LicenseType.RDH,
  LicenseType.DDS_DMD,
  LicenseType.DA,
];

// A licensed dental professional realistically holds a handful of jurisdictions.
// Cap total licenses per account to prevent junk/abuse rows now that multi-state
// is free; never reached by a real user.
const MAX_LICENSES_PER_USER = 10;

export async function addStateLicense(formData: FormData): Promise<void> {
  const user = await requireUser();

  const existing = await prisma.userLicense.count({
    where: { licenseeId: user.id },
  });
  if (existing >= MAX_LICENSES_PER_USER) {
    redirect("/protrack/multistate?error=limit");
  }

  const state = String(formData.get("state") ?? "").trim().toUpperCase();
  const licenseTypeRaw = String(formData.get("licenseType") ?? "");
  const licenseNumber = String(formData.get("licenseNumber") ?? "").trim();

  const licenseType = LICENSE_TYPES.find((t) => t === licenseTypeRaw);
  if (!JURISDICTION_CODES.includes(state) || !licenseType || licenseNumber.length < 2) {
    redirect("/protrack/multistate?error=invalid");
  }

  const requirement = await prisma.stateRequirement.findUnique({
    where: { state_licenseType: { state, licenseType } },
    select: { cycleMonths: true, renewalMonth: true },
  });
  const cycleMonths = requirement?.cycleMonths ?? 24;
  const renewalMonth = requirement?.renewalMonth ?? 12;
  const renewalYear =
    new Date().getUTCFullYear() + Math.max(1, Math.round(cycleMonths / 12));
  const renewalDate = new Date(Date.UTC(renewalYear, renewalMonth, 0));

  try {
    await prisma.userLicense.create({
      data: {
        licenseeId: user.id,
        state,
        licenseType,
        licenseNumber,
        renewalDate,
        isPrimary: false,
      },
    });
  } catch {
    redirect("/protrack/multistate?error=duplicate");
  }

  revalidatePath("/protrack/multistate");
  revalidatePath("/protrack");
  redirect("/protrack/multistate?added=1");
}
