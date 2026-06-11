import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

/*
  Pure helpers for self-serve company registration. Kept out of the "use
  server" actions file so they can be unit-tested without a server runtime.
*/

/**
 * Postgres advisory lock key for a company name. Lowercased + trimmed so two
 * simultaneous registrations that differ only in case serialize on the same
 * lock (the duplicate check is case-insensitive). Mirrors stateLockKey in
 * /api/auth/register-board.
 */
export function companyNameLockKey(name: string): bigint {
  const buf = createHash("sha256")
    .update(`company-name:${name.trim().toLowerCase()}`)
    .digest();
  // Top 8 bytes -> signed bigint (Postgres advisory lock keys are bigint).
  return buf.readBigInt64BE(0);
}

/** True when the error is the companies.name unique-constraint race (P2002). */
export function isUniqueNameViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    (Array.isArray(err.meta?.target)
      ? (err.meta.target as string[]).includes("name")
      : true)
  );
}

/** User-facing message when the organization name is already taken. */
export const DUPLICATE_COMPANY_MESSAGE =
  "That organization is already registered with DentalACE. To be added to an existing organization's account, contact info@dentalace.org.";
