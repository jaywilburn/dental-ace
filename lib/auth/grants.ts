import "server-only";
import type { Prisma, StaffRole } from "@prisma/client";
import { companyNameLockKey, isUniqueNameViolation } from "@/lib/company/register-core";
import type { CompanyRegisterInput } from "@/lib/company/register-schema";
import { createHash } from "node:crypto";

export const DUPLICATE_COMPANY = "DUPLICATE_COMPANY";
export const STATE_ALREADY_CLAIMED = "STATE_ALREADY_CLAIMED";

// No namespace prefix (unlike companyNameLockKey): state codes are canonical 2-char uppercase strings, so the bare hash is collision-safe.
export function stateLockKey(state: string): bigint {
  const buf = createHash("sha256").update(state).digest();
  return buf.readBigInt64BE(0);
}

/** Create the company from a stored COMPANY payload + link the user. Returns companyId. Assumes the user row already exists (this runs at approval time, after signup created it); a missing row throws P2025. */
export async function applyCompanyGrant(
  tx: Prisma.TransactionClient,
  userId: string,
  data: CompanyRegisterInput,
): Promise<string> {
  await tx.$executeRaw`select pg_advisory_xact_lock(${companyNameLockKey(data.name)})`;
  const taken = await tx.company.findFirst({
    where: { name: { equals: data.name, mode: "insensitive" } },
    select: { id: true },
  });
  if (taken) throw new Error(DUPLICATE_COMPANY);
  let company: { id: string };
  try {
    company = await tx.company.create({
      data: {
        name: data.name,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone ?? null,
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2 ?? null,
        city: data.city,
        state: data.state,
        zip: data.zip,
      },
      select: { id: true },
    });
  } catch (err) {
    if (isUniqueNameViolation(err)) throw new Error(DUPLICATE_COMPANY);
    throw err;
  }
  await tx.user.update({ where: { id: userId }, data: { companyId: company.id } });
  return company.id;
}

/** Find-or-fail the board for a state (first-claim), grant verify_access + board_id. Returns boardId. Assumes the user row already exists (this runs at approval time, after signup created it); a missing row throws P2025. */
export async function applyBoardGrant(
  tx: Prisma.TransactionClient,
  userId: string,
  data: { state: string; boardName: string },
): Promise<string> {
  await tx.$executeRaw`select pg_advisory_xact_lock(${stateLockKey(data.state)})`;
  const existing = await tx.board.findUnique({ where: { state: data.state }, select: { id: true } });
  if (existing) throw new Error(STATE_ALREADY_CLAIMED);
  const board = await tx.board.create({
    data: { state: data.state, name: data.boardName },
    select: { id: true },
  });
  await tx.user.update({ where: { id: userId }, data: { verifyAccess: true, boardId: board.id } });
  return board.id;
}

/** Set the staff role for a REVIEWER/ADMIN grant. Assumes the user row already exists (this runs at approval time, after signup created it); a missing row throws P2025. */
export async function applyStaffGrant(
  tx: Prisma.TransactionClient,
  userId: string,
  role: Extract<StaffRole, "REVIEWER" | "ADMIN">,
): Promise<void> {
  await tx.user.update({ where: { id: userId }, data: { staffRole: role } });
}
