/*
  Import US state CE requirements into the state_requirements table.

  Source of truth: prisma/data/state-requirements.ts (aces4ce.com totals, plus
  the TX/CA/FL RDH demo exceptions). Idempotent: upserts on (state, license_type),
  so re-running is a no-op when the data is unchanged. Safe to run against
  prod/staging to top up without reseeding everything.

  Usage: pnpm import:requirements
*/
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@prisma/client";
import { US_STATE_REQUIREMENTS } from "../prisma/data/state-requirements";
import { US_STATES } from "../lib/protrack/reference";

config({ path: ".env.local" });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// Fail fast on malformed data before touching the DB.
function validate() {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const r of US_STATE_REQUIREMENTS) {
    const key = `${r.state}:${r.licenseType}`;
    if (seen.has(key)) errors.push(`duplicate key ${key}`);
    seen.add(key);

    if (!(r.state in US_STATES)) {
      errors.push(`${key}: unknown US state code "${r.state}"`);
    }
    if (!(r.totalHours > 0)) {
      errors.push(`${key}: totalHours must be > 0 (got ${r.totalHours})`);
    }
    if (r.cycleMonths <= 0 || r.cycleMonths % 12 !== 0 || r.cycleMonths > 120) {
      errors.push(
        `${key}: cycleMonths must be a positive multiple of 12 up to 120 (got ${r.cycleMonths})`,
      );
    }
    if (
      r.renewalMonth !== null &&
      (r.renewalMonth < 1 || r.renewalMonth > 12)
    ) {
      errors.push(`${key}: renewalMonth must be null or 1-12 (got ${r.renewalMonth})`);
    }
  }

  if (errors.length) {
    throw new Error(`Invalid state requirement data:\n  - ${errors.join("\n  - ")}`);
  }
}

async function main() {
  validate();

  for (const r of US_STATE_REQUIREMENTS) {
    const data = {
      totalHours: r.totalHours,
      cycleMonths: r.cycleMonths,
      renewalMonth: r.renewalMonth,
      categories: r.categories as unknown as Prisma.InputJsonValue,
      status: r.status,
      source: r.source,
    };
    await prisma.stateRequirement.upsert({
      where: {
        state_licenseType: { state: r.state, licenseType: r.licenseType },
      },
      update: data,
      create: { state: r.state, licenseType: r.licenseType, ...data },
    });
  }

  const confirmed = US_STATE_REQUIREMENTS.filter(
    (r) => r.source === "aces4ce.com",
  ).length;
  console.log(
    `✓ Imported ${US_STATE_REQUIREMENTS.length} US state requirements ` +
      `(${confirmed} confirmed from aces4ce.com, ${US_STATE_REQUIREMENTS.length - confirmed} provisional demo rows)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
