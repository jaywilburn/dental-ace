import "server-only";
import type { Prisma, AdminAuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/*
  Append-only audit trail for app-admin actions on users. Every mutation in
  lib/admin/users.ts records exactly one row here. Accepts a transaction client
  so the audit row can be written in the SAME transaction as the change it
  records (atomic — no orphan logs, no logged-but-not-applied), mirroring how
  lib/admin/billing-overrides.ts writes its ADMIN_OVERRIDE row in-transaction.

  Pass `prisma` directly for single-statement mutations that don't need a tx.
*/

export type AdminActionInput = {
  actorUserId: string;
  /** null when the target row no longer exists; keep its identity in `details`. */
  targetUserId?: string | null;
  action: AdminAuditAction;
  summary: string;
  details?: Prisma.InputJsonValue;
};

export async function recordAdminAction(
  client: Prisma.TransactionClient | typeof prisma,
  input: AdminActionInput,
): Promise<void> {
  await client.adminAuditLog.create({
    data: {
      actorUserId: input.actorUserId,
      targetUserId: input.targetUserId ?? null,
      action: input.action,
      summary: input.summary,
      details: input.details ?? {},
    },
  });
}
