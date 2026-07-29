"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BillingTransactionType } from "@prisma/client";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  validateAppCreditAdjustment,
  validateCertBalanceAdjustment,
  type OverrideValidation,
} from "@/lib/admin/override-rules";

/*
  Admin billing overrides (PRD Flow F). Each adjustment runs in a transaction
  with a SELECT ... FOR UPDATE lock on the company row, re-reads the balance
  UNDER that lock, validates against it, mutates, and writes an append-only
  billing_transactions row (amountCents 0, stripeEventId null, performedById =
  admin). No edit/delete path.

  Both balances move in either direction, and each writes a type that names the
  balance it touched, so a mis-grant is both reversible and legible.
*/

class OverrideError extends Error {}

type BalanceField = "applicationCredits" | "certBalance";

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
        select: { applicationCredits: true, certBalance: true },
      });
      const v = validate(delta, company[field]);
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
