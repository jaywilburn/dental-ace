"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AdminAuditAction } from "@prisma/client";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { recordAdminAction } from "@/lib/admin/audit";
import { validateCompanyRename } from "@/lib/admin/company-rename-rules";
import {
  companyNameLockKey,
  isUniqueNameViolation,
  DUPLICATE_COMPANY_MESSAGE,
} from "@/lib/company/register-core";

/*
  Admin company rename. Runs in one transaction: row lock on the company (a
  stable old name), the same advisory lock + case-insensitive duplicate check
  self-serve registration uses (excluding the company itself, so case-only
  fixes are allowed), then the name update, the cascade to ProTrack snapshots,
  and a COMPANY_RENAMED audit row.

  The cascade rewrites ce_certificates.provider for certs LINKED to this
  company's issued certs (issuedCertificateId → companyId). Provider is a
  snapshot taken at sync time (lib/protrack/ace-sync.ts toCeCertData), so
  without this, already-synced ProTrack records keep the old name forever.
  Licensee-uploaded certs (issuedCertificateId null) are never touched, even
  if their typed provider string happens to match.
*/

class RenameError extends Error {}

export async function renameCompany(formData: FormData) {
  const admin = await requireStaff("ADMIN");
  const companyId = String(formData.get("companyId") ?? "");
  const rawName = String(formData.get("name") ?? "");
  if (!companyId) throw new Error("companyId required");

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select id from public.companies where id = ${companyId}::uuid for update`;
      const company = await tx.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { name: true },
      });
      const v = validateCompanyRename(rawName, company.name);
      if (!v.ok) throw new RenameError(v.error);

      await tx.$executeRaw`select pg_advisory_xact_lock(${companyNameLockKey(v.name)})`;
      const taken = await tx.company.findFirst({
        where: { name: { equals: v.name, mode: "insensitive" }, id: { not: companyId } },
        select: { id: true },
      });
      if (taken) throw new RenameError(DUPLICATE_COMPANY_MESSAGE);

      await tx.company.update({ where: { id: companyId }, data: { name: v.name } });
      const synced = await tx.ceCertificate.updateMany({
        where: { issuedCertificate: { companyId } },
        data: { provider: v.name },
      });
      await recordAdminAction(tx, {
        actorUserId: admin.id,
        action: AdminAuditAction.COMPANY_RENAMED,
        summary: `Renamed company "${company.name}" to "${v.name}"`,
        details: {
          companyId,
          // companyName is the shared key the audit log links a company by;
          // oldName/newName stay for the rename-specific record.
          companyName: v.name,
          oldName: company.name,
          newName: v.name,
          protrackCertsUpdated: synced.count,
        },
      });
    });
  } catch (err) {
    if (err instanceof RenameError) {
      redirect(`/admin/companies/${companyId}?error=${encodeURIComponent(err.message)}`);
    }
    if (isUniqueNameViolation(err)) {
      redirect(`/admin/companies/${companyId}?error=${encodeURIComponent(DUPLICATE_COMPANY_MESSAGE)}`);
    }
    throw err;
  }

  revalidatePath(`/admin/companies/${companyId}`);
  revalidatePath("/admin/companies");
  redirect(`/admin/companies/${companyId}?ok=renamed`);
}
