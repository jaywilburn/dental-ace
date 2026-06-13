import "server-only";
import { Prisma, type AccessRequestKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { companyRegisterSchema } from "@/lib/company/register-schema";
import { boardSignupSchema } from "@/lib/board/signup-schema";
import { US_STATES } from "@/lib/protrack/reference";
import { sendEmail } from "@/lib/email/send";
import { appBaseUrl } from "@/lib/app-url";
import AccessRequestReceivedEmail from "@/emails/access-request-received";
import AccessRequestNewAdminEmail from "@/emails/access-request-new-admin";

export function roleLabelFor(kind: AccessRequestKind): string {
  switch (kind) {
    case "COMPANY": return "CE Company";
    case "BOARD": return "State Board";
    case "REVIEWER": return "AADB Reviewer";
    case "ADMIN": return "AADB Admin";
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
    if (!US_STATES[p.data.state]) return { ok: false, message: "Pick a valid US state." };
    return { ok: true, payload: p.data, label: `${US_STATES[p.data.state]}, ${p.data.boardName}` };
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

  const adminEmail = process.env.AADB_ADMIN_EMAIL;
  if (adminEmail) {
    const adminProps = {
      roleLabel,
      requestLabel: v.label,
      requesterName: user.firstName ?? user.email,
      requesterEmail: user.email,
      queueUrl: `${appBaseUrl(origin)}/admin/access-requests`,
    };
    void sendEmail({
      to: adminEmail,
      subject: AccessRequestNewAdminEmail.subject(adminProps),
      react: AccessRequestNewAdminEmail(adminProps),
    }).catch(() => {});
  }
  return { ok: true };
}
