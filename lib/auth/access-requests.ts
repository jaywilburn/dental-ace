import "server-only";
import { Prisma, type AccessRequestKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { companyRegisterSchema } from "@/lib/company/register-schema";
import { boardSignupSchema } from "@/lib/board/signup-schema";
import { JURISDICTIONS } from "@/lib/protrack/reference";
import { sendEmail } from "@/lib/email/send";
import { appBaseUrl } from "@/lib/app-url";
import AccessRequestReceivedEmail from "@/emails/access-request-received";
import AccessRequestNewAdminEmail from "@/emails/access-request-new-admin";
import { applyCompanyGrant, applyBoardGrant, applyStaffGrant, DUPLICATE_COMPANY, STATE_ALREADY_CLAIMED } from "@/lib/auth/grants";
import { recordAdminAction } from "@/lib/admin/audit";
import type { CompanyRegisterInput } from "@/lib/company/register-schema";
import AccessRequestApprovedEmail from "@/emails/access-request-approved";
import AccessRequestDeniedEmail from "@/emails/access-request-denied";
import { ONBOARDING_SCHEDULER_URL } from "@/lib/onboarding";

export function roleLabelFor(kind: AccessRequestKind): string {
  switch (kind) {
    case "COMPANY": return "CE Company";
    case "BOARD": return "State Board";
    case "REVIEWER": return "AADB Reviewer";
    case "ADMIN": return "AADB Admin";
  }
}

function approvedAreaPath(kind: AccessRequestKind): string {
  switch (kind) {
    case "COMPANY": return "/company";
    case "BOARD": return "/board";
    case "ADMIN": return "/admin";
    case "REVIEWER": return "/reviewer";
  }
}

const boardPayloadSchema = boardSignupSchema.pick({ state: true, boardName: true });

export type ValidatedPayload =
  | { ok: true; payload: Record<string, unknown>; label: string }
  | { ok: false; message: string };

export function validateRequestPayload(kind: AccessRequestKind, raw: unknown): ValidatedPayload {
  if (kind === "COMPANY") {
    const p = companyRegisterSchema.safeParse(raw);
    if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Check the form." };
    return { ok: true, payload: p.data, label: p.data.name };
  }
  if (kind === "BOARD") {
    const p = boardPayloadSchema.safeParse(raw);
    if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Check the form." };
    if (!JURISDICTIONS[p.data.state]) return { ok: false, message: "Pick a valid state or province." };
    return { ok: true, payload: p.data, label: `${JURISDICTIONS[p.data.state]}, ${p.data.boardName}` };
  }
  return { ok: true, payload: {}, label: roleLabelFor(kind) };
}

export async function pendingKindsFor(userId: string): Promise<Set<AccessRequestKind>> {
  const rows = await prisma.accessRequest.findMany({
    where: { userId, status: "PENDING" },
    select: { kind: true },
  });
  return new Set(rows.map((r) => r.kind));
}

export type CreateRequestResult = { ok: true } | { ok: false; message: string };

export async function createRequest(
  user: { id: string; email: string; firstName: string | null },
  kind: AccessRequestKind,
  rawPayload: unknown,
  note: string | undefined,
  origin: string,
): Promise<CreateRequestResult> {
  const v = validateRequestPayload(kind, rawPayload);
  if (!v.ok) return { ok: false, message: v.message };

  try {
    await prisma.accessRequest.create({
      data: { userId: user.id, kind, payload: v.payload as object, label: v.label, note: note ?? null },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, message: "You already have a pending request for this access." };
    }
    throw err;
  }

  const roleLabel = roleLabelFor(kind);
  const firstName = user.firstName ?? user.email;
  const receivedProps = { firstName, roleLabel };
  void sendEmail({
    to: user.email,
    subject: AccessRequestReceivedEmail.subject(receivedProps),
    react: AccessRequestReceivedEmail(receivedProps),
  }).catch(() => {});

  // AADB_ADMIN_EMAIL may be a single shared inbox (info@dentalace.org) or a
  // comma-separated list, so AADB can add individual admins without a code change.
  const adminEmails = (process.env.AADB_ADMIN_EMAIL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (adminEmails.length > 0) {
    const adminProps = {
      roleLabel,
      requestLabel: v.label,
      requesterName: user.firstName ?? user.email,
      requesterEmail: user.email,
      queueUrl: `${appBaseUrl(origin)}/admin/access-requests`,
    };
    void sendEmail({
      to: adminEmails,
      subject: AccessRequestNewAdminEmail.subject(adminProps),
      react: AccessRequestNewAdminEmail(adminProps),
    }).catch(() => {});
  }
  return { ok: true };
}

export type DecisionResult = { ok: true } | { ok: false; message: string };

export async function approveRequest(requestId: string, adminId: string, origin: string): Promise<DecisionResult> {
  let approved: { userId: string; kind: AccessRequestKind; email: string; firstName: string | null } | null = null;
  try {
    approved = await prisma.$transaction(async (tx) => {
      // Atomically claim the request: flip PENDING -> APPROVED only if still PENDING.
      // Closes the TOCTOU window — two concurrent approvals can't both pass.
      const claimed = await tx.accessRequest.updateMany({
        where: { id: requestId, status: "PENDING" },
        data: { status: "APPROVED", decidedByUserId: adminId, decidedAt: new Date() },
      });
      if (claimed.count === 0) throw new Error("NOT_PENDING");

      const req = await tx.accessRequest.findUniqueOrThrow({ where: { id: requestId } });

      // Apply the entitlement. If a grant throws (duplicate company / claimed
      // state), the whole tx rolls back, including the status flip — the
      // request stays PENDING for the admin to deny.
      if (req.kind === "COMPANY") {
        await applyCompanyGrant(tx, req.userId, req.payload as unknown as CompanyRegisterInput);
      } else if (req.kind === "BOARD") {
        await applyBoardGrant(tx, req.userId, req.payload as { state: string; boardName: string });
      } else {
        await applyStaffGrant(tx, req.userId, req.kind === "ADMIN" ? "ADMIN" : "REVIEWER");
      }

      await recordAdminAction(tx, {
        actorUserId: adminId,
        targetUserId: req.userId,
        action: "ACCESS_REQUEST_APPROVED",
        summary: `Approved ${roleLabelFor(req.kind)} access: ${req.label}`,
        details: { requestId, kind: req.kind },
      });
      // userId FK is ON DELETE RESTRICT, so the user row is guaranteed to exist here.
      const u = await tx.user.findUniqueOrThrow({ where: { id: req.userId }, select: { email: true, firstName: true } });
      return { userId: req.userId, kind: req.kind, email: u.email, firstName: u.firstName };
    });
  } catch (err) {
    if (err instanceof Error && err.message === DUPLICATE_COMPANY)
      return { ok: false, message: "That organization name is already registered. Deny this request and ask them to contact AADB." };
    if (err instanceof Error && err.message === STATE_ALREADY_CLAIMED)
      return { ok: false, message: "That state board is already claimed. Deny this request." };
    if (err instanceof Error && err.message === "NOT_PENDING")
      return { ok: false, message: "That request was already decided." };
    throw err;
  }

  const areaUrl = `${appBaseUrl(origin)}${approvedAreaPath(approved.kind)}`;
  const approvedProps = {
    firstName: approved.firstName ?? approved.email,
    roleLabel: roleLabelFor(approved.kind),
    areaUrl,
    // Only CE Company customers get the onboarding-call invite.
    onboardingUrl: approved.kind === "COMPANY" ? ONBOARDING_SCHEDULER_URL : undefined,
  };
  void sendEmail({
    to: approved.email,
    subject: AccessRequestApprovedEmail.subject(approvedProps),
    react: AccessRequestApprovedEmail(approvedProps),
  }).catch(() => {});
  return { ok: true };
}

export async function denyRequest(requestId: string, adminId: string, reason: string): Promise<DecisionResult> {
  const trimmed = reason.trim().slice(0, 500) || "Not approved.";
  const decided = await prisma.$transaction(async (tx) => {
    const claimed = await tx.accessRequest.updateMany({
      where: { id: requestId, status: "PENDING" },
      data: { status: "DENIED", decidedByUserId: adminId, decidedAt: new Date(), denyReason: trimmed },
    });
    if (claimed.count === 0) return null;
    const req = await tx.accessRequest.findUniqueOrThrow({ where: { id: requestId } });
    await recordAdminAction(tx, {
      actorUserId: adminId, targetUserId: req.userId, action: "ACCESS_REQUEST_DENIED",
      summary: `Denied ${roleLabelFor(req.kind)} access: ${req.label}`, details: { requestId, kind: req.kind, reason: trimmed },
    });
    const u = await tx.user.findUniqueOrThrow({ where: { id: req.userId }, select: { email: true, firstName: true } });
    return { kind: req.kind, email: u.email, firstName: u.firstName };
  });
  if (!decided) return { ok: false, message: "That request was already decided." };
  const deniedProps = { firstName: decided.firstName ?? decided.email, roleLabel: roleLabelFor(decided.kind), reason: trimmed };
  void sendEmail({
    to: decided.email, subject: AccessRequestDeniedEmail.subject(deniedProps),
    react: AccessRequestDeniedEmail(deniedProps),
  }).catch(() => {});
  return { ok: true };
}
