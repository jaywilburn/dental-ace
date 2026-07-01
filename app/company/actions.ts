"use server";

import { revalidatePath } from "next/cache";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/*
  Dismiss the "schedule your onboarding call" banner on the company dashboard.
  Stamps the caller's company so the banner stays hidden across devices. Guarded
  by requireDentalAce() so only a company member can dismiss their own banner.
*/
export async function dismissOnboarding(): Promise<void> {
  const user = await requireDentalAce();
  if (!user.companyId) return;
  await prisma.company.update({
    where: { id: user.companyId },
    data: { onboardingDismissedAt: new Date() },
  });
  revalidatePath("/company");
}
