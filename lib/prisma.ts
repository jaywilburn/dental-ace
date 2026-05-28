import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/*
  Shared Prisma client (Prisma 7 driver-adapter style).

  DATABASE_URL must point to a Postgres connection (pooled in prod, direct in dev).
  The instance is singleton across hot reloads via globalThis.
*/

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required to instantiate Prisma");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
