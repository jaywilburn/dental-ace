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

export async function requireApplicationCredits(): Promise<{
  user: SessionUser;
  credits: CompanyCredits;
}> {
  const user = await requireDentalAce();
  if (!user.companyId) redirect("/home");

  const credits = await prisma.company.findUnique({
    where: { id: user.companyId },
    select: { applicationCredits: true },
  });
  if (!credits || !hasAvailableCredits(credits)) {
    redirect("/company/buy/credits?need=credits");
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
