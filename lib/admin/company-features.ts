"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AdminAuditAction } from "@prisma/client";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { recordAdminAction } from "@/lib/admin/audit";
import {
  companyFeatureSummary,
  parseCompanyFeatureForm,
} from "@/lib/admin/company-feature-rules";

/*
  Admin per-company feature toggle (event surveys, attendance codes). One
  transaction: row lock on the company (serialises two admins flipping the same
  flag), re-read the current value under the lock, skip if it already matches,
  otherwise update it and write a COMPANY_FEATURE_CHANGED audit row. Mirrors
  company-rename.ts.

  The form posts the TARGET state, not "toggle", so a double submit or a stale
  tab is a harmless no-op that writes no audit row.

  Turning a feature off hides it going forward; nothing already authored is
  deleted. A stored attendance-code question stays readable, but submitEvent
  refuses it while the flag is off, and the survey stops showing on the
  attendee link.
*/

export async function setCompanyFeature(formData: FormData) {
  const admin = await requireStaff("ADMIN");
  const parsed = parseCompanyFeatureForm({
    companyId: formData.get("companyId"),
    feature: formData.get("feature"),
    enabled: formData.get("enabled"),
  });
  if (!parsed) {
    redirect(`/admin/companies?error=${encodeURIComponent("Invalid feature request.")}`);
  }
  const { companyId, feature, enabled } = parsed;

  const changed = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select id from public.companies where id = ${companyId}::uuid for update`;
    const company = await tx.company.findUnique({
      where: { id: companyId },
      select: { name: true, surveyEnabled: true, attendanceCodesEnabled: true },
    });
    if (!company) return null;
    const from = company[feature];
    if (from === enabled) return false;

    await tx.company.update({ where: { id: companyId }, data: { [feature]: enabled } });
    await recordAdminAction(tx, {
      actorUserId: admin.id,
      action: AdminAuditAction.COMPANY_FEATURE_CHANGED,
      summary: companyFeatureSummary(feature, enabled, company.name),
      details: {
        companyId,
        // companyName is the shared key the audit log links a company by.
        companyName: company.name,
        feature,
        from,
        to: enabled,
      },
    });
    return true;
  });
  if (changed === null) {
    redirect(`/admin/companies?error=${encodeURIComponent("Company not found.")}`);
  }

  // Provider and attendee pages are dynamic (session cookies / force-dynamic),
  // so only the admin page needs revalidating.
  revalidatePath(`/admin/companies/${companyId}`);
  // The page renders the message from the CURRENT value of `feature`, so a
  // no-op (already in that state) reads the same as a change.
  redirect(`/admin/companies/${companyId}?ok=feature&feature=${feature}`);
}
