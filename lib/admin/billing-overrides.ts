"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AdminAuditAction, BillingTransactionType } from "@prisma/client";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { recordAdminAction } from "@/lib/admin/audit";
import {
  validateAppCreditAdjustment,
  validateCertBalanceAdjustment,
  balanceAdjustmentSummary,
  type BalanceField,
  type OverrideValidation,
} from "@/lib/admin/override-rules";

/*
  Admin billing overrides (PRD Flow F). Each adjustment runs in a transaction
  with a SELECT ... FOR UPDATE lock on the company row, re-reads the balance
  UNDER that lock, validates against it, mutates, and writes BOTH an append-only
  billing_transactions row (amountCents 0, stripeEventId null, performedById =
  admin) and a COMPANY_BALANCE_ADJUSTED audit row. No edit/delete path.

  Both balances move in either direction, and each writes a type that names the
  balance it touched, so a mis-grant is both reversible and legible.

  The audit row is written in the SAME transaction as the balance change, so
  there is no such thing as an applied-but-unlogged adjustment. It duplicates
  what billing_transactions records on purpose: that table answers "what is this
  company's billing history", the audit log answers "what have admins done", and
  before 2026-07-29 a balance change appeared only in the first, so nobody
  looking in the Audit Log could see money move.
*/

class OverrideError extends Error {}

/**
 * Applies `delta` to one company balance under a row lock, validating against
 * the value read UNDER that lock so two concurrent admins can't drive a
 * balance negative between the check and the write.
 */
async function applyAdjustment(opts: {
  companyId: string;
  delta: number;
  adminId: string;
  field: BalanceField;
  txnType: BillingTransactionType;
  validate: (delta: number, currentBalance: number) => OverrideValidation;
}) {
  const { companyId, delta, adminId, field, txnType, validate } = opts;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select id from public.companies where id = ${companyId}::uuid for update`;
      const company = await tx.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { name: true, applicationCredits: true, certBalance: true },
      });
      const before = company[field];
      const v = validate(delta, before);
      if (!v.ok) throw new OverrideError(v.error);
      await tx.company.update({
        where: { id: companyId },
        data: { [field]: { increment: delta } },
      });
      await tx.billingTransaction.create({
        data: {
          companyId,
          type: txnType,
          quantity: delta,
          amountCents: 0,
          performedById: adminId,
        },
      });
      await recordAdminAction(tx, {
        actorUserId: adminId,
        // The subject is a company, not a user; identity lives in details.
        targetUserId: null,
        action: AdminAuditAction.COMPANY_BALANCE_ADJUSTED,
        summary: balanceAdjustmentSummary({
          field,
          delta,
          before,
          companyName: company.name,
        }),
        details: {
          companyId,
          companyName: company.name,
          balance: field,
          delta,
          before,
          after: before + delta,
        },
      });
    });
  } catch (err) {
    if (err instanceof OverrideError) {
      redirect(`/admin/companies/${companyId}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }
}

export async function adjustAppCredits(formData: FormData) {
  const admin = await requireStaff("ADMIN");
  const companyId = String(formData.get("companyId") ?? "");
  const delta = Number(formData.get("delta") ?? 0);
  if (!companyId) throw new Error("companyId required");

  await applyAdjustment({
    companyId,
    delta,
    adminId: admin.id,
    field: "applicationCredits",
    txnType: BillingTransactionType.ADMIN_OVERRIDE_APP_CREDITS,
    validate: validateAppCreditAdjustment,
  });

  revalidatePath(`/admin/companies/${companyId}`);
  redirect(`/admin/companies/${companyId}?ok=credits`);
}

export async function adjustCertBalance(formData: FormData) {
  const admin = await requireStaff("ADMIN");
  const companyId = String(formData.get("companyId") ?? "");
  const delta = Number(formData.get("delta") ?? 0);
  if (!companyId) throw new Error("companyId required");

  await applyAdjustment({
    companyId,
    delta,
    adminId: admin.id,
    field: "certBalance",
    txnType: BillingTransactionType.ADMIN_OVERRIDE_CERTS,
    validate: validateCertBalanceAdjustment,
  });

  revalidatePath(`/admin/companies/${companyId}`);
  redirect(`/admin/companies/${companyId}?ok=balance`);
}
