"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BillingTransactionType } from "@prisma/client";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  validateAppCreditGrant,
  validateCertBalanceAdjustment,
} from "@/lib/admin/override-rules";

/*
  Admin billing overrides (PRD Flow F). Each grant runs in a transaction with a
  SELECT ... FOR UPDATE lock on the company row, mutates the balance, and writes
  an append-only ADMIN_OVERRIDE billing_transactions row (amountCents 0,
  stripeEventId null, performedById = admin). No edit/delete path.
*/

class OverrideError extends Error {}

function oneYearFromNow(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d;
}

export async function grantAppCredits(formData: FormData) {
  const admin = await requireStaff("ADMIN");
  const companyId = String(formData.get("companyId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);
  const expedited = formData.get("expedited") === "true";
  if (!companyId) throw new Error("companyId required");

  const v = validateAppCreditGrant(quantity);
  if (!v.ok) redirect(`/admin/companies/${companyId}?error=${encodeURIComponent(v.error)}`);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select id from public.companies where id = ${companyId}::uuid for update`;
    await tx.company.update({
      where: { id: companyId },
      data: expedited
        ? { expeditedCredits: { increment: quantity }, applicationCreditsExpiresAt: oneYearFromNow() }
        : { applicationCredits: { increment: quantity }, applicationCreditsExpiresAt: oneYearFromNow() },
    });
    await tx.billingTransaction.create({
      data: {
        companyId,
        type: BillingTransactionType.ADMIN_OVERRIDE,
        quantity,
        amountCents: 0,
        isExpedited: expedited,
        performedById: admin.id,
      },
    });
  });

  revalidatePath(`/admin/companies/${companyId}`);
  redirect(`/admin/companies/${companyId}?ok=credits`);
}

export async function adjustCertBalance(formData: FormData) {
  const admin = await requireStaff("ADMIN");
  const companyId = String(formData.get("companyId") ?? "");
  const delta = Number(formData.get("delta") ?? 0);
  if (!companyId) throw new Error("companyId required");

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select id from public.companies where id = ${companyId}::uuid for update`;
      const company = await tx.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { certBalance: true },
      });
      const v = validateCertBalanceAdjustment(delta, company.certBalance);
      if (!v.ok) throw new OverrideError(v.error);
      await tx.company.update({
        where: { id: companyId },
        data: { certBalance: { increment: delta } },
      });
      await tx.billingTransaction.create({
        data: {
          companyId,
          type: BillingTransactionType.ADMIN_OVERRIDE,
          quantity: delta,
          amountCents: 0,
          performedById: admin.id,
        },
      });
    });
  } catch (err) {
    if (err instanceof OverrideError) {
      redirect(`/admin/companies/${companyId}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  revalidatePath(`/admin/companies/${companyId}`);
  redirect(`/admin/companies/${companyId}?ok=balance`);
}
