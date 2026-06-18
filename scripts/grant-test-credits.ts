/*
  Dev-only helper: grant testing credits to the customer@ seed account's
  company (Texas Dental Association). Bumps application credits and the cert
  balance, and records an ADMIN_OVERRIDE billing transaction so the grant shows
  up in Recent Activity like a real top-up.

  Usage: pnpm exec tsx scripts/grant-test-credits.ts [appCredits] [certs]
  Defaults: 10 app credits, 250 certs.
*/
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

config({ path: ".env.local" });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const APP = Number(process.argv[2] ?? 10);
const CERTS = Number(process.argv[3] ?? 250);

async function main() {
  const company = await prisma.company.findFirst({
    where: { name: "Texas Dental Association" },
    select: {
      id: true,
      name: true,
      applicationCredits: true,
      certBalance: true,
    },
  });
  if (!company) {
    throw new Error(
      'Company "Texas Dental Association" not found. Run `pnpm seed` first.',
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const c = await tx.company.update({
      where: { id: company.id },
      data: {
        applicationCredits: { increment: APP },
        certBalance: { increment: CERTS },
      },
      select: {
        applicationCredits: true,
        certBalance: true,
      },
    });
    if (APP > 0) {
      await tx.billingTransaction.create({
        data: {
          companyId: company.id,
          type: "ADMIN_OVERRIDE",
          quantity: APP,
          amountCents: 0,
        },
      });
    }
    if (CERTS > 0) {
      await tx.billingTransaction.create({
        data: {
          companyId: company.id,
          type: "ADMIN_OVERRIDE",
          quantity: CERTS,
          amountCents: 0,
        },
      });
    }
    return c;
  });

  console.log(`✓ Granted test credits to ${company.name} (${company.id})`);
  console.log(
    `  App credits:  ${company.applicationCredits} → ${updated.applicationCredits}  (+${APP})`,
  );
  console.log(
    `  Cert balance: ${company.certBalance} → ${updated.certBalance}  (+${CERTS})`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
