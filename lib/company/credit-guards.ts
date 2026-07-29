import "server-only";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireDentalAce, type SessionUser } from "@/lib/auth/session";
import {
  canViewCertificateLog,
  hasAvailableCredits,
  type CompanyCredits,
} from "@/lib/company/credit-gate";

/*
  Redirecting guards for credit-gated company pages. The pure decisions live
  in ./credit-gate.ts (unit-tested); these wrappers load the balances and
  bounce credit-less companies to the Buy App Credits page.
*/

export async function requireApplicationCredits(opts?: {
  /**
   * The draft being edited. When that application's credit is already settled
   * (a revision after a review decision), the balance check is skipped: the
   * resubmit is free, so a company at zero credits must still be able to open
   * the wizard. Without this, "revise and resubmit" would bounce the provider
   * to the buy page and the free-resubmit policy would be unreachable.
   */
  applicationId?: string;
}): Promise<{
  user: SessionUser;
  credits: CompanyCredits;
}> {
  const user = await requireDentalAce();
  if (!user.companyId) redirect("/home");

  const credits = await prisma.company.findUnique({
    where: { id: user.companyId },
    select: { applicationCredits: true },
  });
  if (!credits) redirect("/company/buy/credits?need=credits");

  if (!hasAvailableCredits(credits)) {
    const settled = opts?.applicationId
      ? await prisma.courseApplication.findFirst({
          where: {
            id: opts.applicationId,
            companyId: user.companyId,
            creditChargedAt: { not: null },
          },
          select: { id: true },
        })
      : null;
    if (!settled) redirect("/company/buy/credits?need=credits");
  }
  return { user, credits };
}

export async function requireCertificateLogAccess(): Promise<{
  user: SessionUser;
}> {
  const user = await requireDentalAce();
  if (!user.companyId) redirect("/home");

  const [credits, issuedCertCount] = await Promise.all([
    prisma.company.findUnique({
      where: { id: user.companyId },
      select: { applicationCredits: true },
    }),
    prisma.issuedCertificate.count({ where: { companyId: user.companyId } }),
  ]);
  if (!credits || !canViewCertificateLog(credits, issuedCertCount)) {
    redirect("/company/buy/credits?need=credits");
  }
  return { user };
}
