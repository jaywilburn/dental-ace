"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { StaffRole } from "@prisma/client";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { recordAdminAction } from "@/lib/admin/audit";
import { signEmailVerificationToken } from "@/lib/auth/verification-token";
import { signSetPasswordToken } from "@/lib/auth/set-password-token";
import { sendEmail } from "@/lib/email/send";
import VerifyEmail from "@/emails/verify-email";
import StaffInviteEmail from "@/emails/staff-invite";

/*
  App-admin user management. Every action: requireStaff("ADMIN") → Zod-validate →
  mutate (+ recordAdminAction) → revalidate → redirect back to the detail page
  with ?ok= / ?error=. Same UX contract as lib/admin/billing-overrides.ts.

  Entitlement changes (staffRole, companyId, protrackTier, verifyAccess) only
  reach RLS / current_user_role() on the TARGET's next token refresh; the app's
  own require* guards re-read Prisma each request so access flips immediately on
  their next request. The UI surfaces "applies on next sign-in" accordingly.

  We never hard-delete (compliance/audit); suspendAccount is the terminal state.
*/

// ── helpers ──────────────────────────────────────────────────────────────────

function field(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "");
}

/** Redirect back to the user-detail page with a status flag. `redirect` throws. */
function back(userId: string, params: { ok?: string; error?: string }): never {
  const qs = new URLSearchParams();
  if (params.ok) qs.set("ok", params.ok);
  if (params.error) qs.set("error", params.error);
  redirect(`/admin/users/${userId}?${qs.toString()}`);
}

function fail(userId: string, message: string): never {
  back(userId, { error: message });
}

/** True when the target IS an enabled ADMIN and the only one left. */
async function isLastEnabledAdmin(targetId: string): Promise<boolean> {
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { staffRole: true, disabledAt: true },
  });
  if (!target || target.staffRole !== "ADMIN" || target.disabledAt) return false;
  const enabledAdmins = await prisma.user.count({
    where: { staffRole: "ADMIN", disabledAt: null },
  });
  return enabledAdmins <= 1;
}

const resolveSchema = z.object({ userId: z.string().uuid() });

async function loadTarget(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      staffRole: true, companyId: true, protrackTier: true, proExpiresAt: true,
      verifyAccess: true, boardId: true, emailVerifiedAt: true, disabledAt: true,
    },
  });
}

// ── profile ──────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  userId: z.string().uuid(),
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
});

export async function updateProfile(formData: FormData) {
  const admin = await requireStaff("ADMIN");
  const parsed = profileSchema.safeParse({
    userId: field(formData, "userId"),
    firstName: field(formData, "firstName"),
    lastName: field(formData, "lastName"),
    email: field(formData, "email"),
  });
  if (!parsed.success) {
    const id = field(formData, "userId");
    fail(id, parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const data = parsed.data;

  const before = await loadTarget(data.userId);
  if (!before) fail(data.userId, "Account not found.");

  const emailChanged = data.email !== before.email;
  if (emailChanged) {
    const collision = await prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true },
    });
    if (collision && collision.id !== data.userId) {
      fail(data.userId, "Another account already uses that email.");
    }
    // Keep Supabase Auth in sync. Update Auth first; if the Prisma write then
    // fails, revert the Auth email so the two systems don't drift.
    const sb = createServiceRoleClient();
    const { error: authErr } = await sb.auth.admin.updateUserById(data.userId, {
      email: data.email,
    });
    if (authErr) fail(data.userId, "Could not update the login email.");
    try {
      await prisma.user.update({
        where: { id: data.userId },
        data: { firstName: data.firstName, lastName: data.lastName, email: data.email },
      });
    } catch {
      await sb.auth.admin
        .updateUserById(data.userId, { email: before.email })
        .catch(() => {});
      fail(data.userId, "Could not save the profile. Please try again.");
    }
  } else {
    await prisma.user.update({
      where: { id: data.userId },
      data: { firstName: data.firstName, lastName: data.lastName },
    });
  }

  await recordAdminAction(prisma, {
    actorUserId: admin.id,
    targetUserId: data.userId,
    action: "PROFILE_UPDATED",
    summary: `Updated profile for ${data.email}`,
    details: {
      before: { firstName: before.firstName, lastName: before.lastName, email: before.email },
      after: { firstName: data.firstName, lastName: data.lastName, email: data.email },
    },
  });

  revalidatePath(`/admin/users/${data.userId}`);
  back(data.userId, { ok: "profile" });
}

// ── staff role ───────────────────────────────────────────────────────────────

const staffRoleSchema = z.object({
  userId: z.string().uuid(),
  staffRole: z.enum(["NONE", "REVIEWER", "ADMIN"]),
});

export async function setStaffRole(formData: FormData) {
  const admin = await requireStaff("ADMIN");
  const parsed = staffRoleSchema.safeParse({
    userId: field(formData, "userId"),
    staffRole: field(formData, "staffRole"),
  });
  if (!parsed.success) fail(field(formData, "userId"), "Invalid role change.");
  const { userId, staffRole } = parsed.data;

  const before = await loadTarget(userId);
  if (!before) fail(userId, "Account not found.");
  if (before.staffRole === staffRole) back(userId, { ok: "role" });

  const losingAdmin = before.staffRole === "ADMIN" && staffRole !== "ADMIN";
  if (losingAdmin) {
    if (userId === admin.id) fail(userId, "You can't remove your own admin access.");
    if (await isLastEnabledAdmin(userId)) {
      fail(userId, "This is the last active admin. Promote another admin first.");
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { staffRole } });
  await recordAdminAction(prisma, {
    actorUserId: admin.id,
    targetUserId: userId,
    action: "STAFF_ROLE_CHANGED",
    summary: `Staff role ${before.staffRole} → ${staffRole} for ${before.email}`,
    details: { from: before.staffRole, to: staffRole },
  });

  revalidatePath(`/admin/users/${userId}`);
  back(userId, { ok: "role" });
}

// ── DentalACE company link ───────────────────────────────────────────────────

const linkSchema = z.object({
  userId: z.string().uuid(),
  companyId: z.string().uuid("Pick a company"),
});

export async function linkCompany(formData: FormData) {
  const admin = await requireStaff("ADMIN");
  const parsed = linkSchema.safeParse({
    userId: field(formData, "userId"),
    companyId: field(formData, "companyId"),
  });
  if (!parsed.success) fail(field(formData, "userId"), parsed.error.issues[0]?.message ?? "Invalid input");
  const { userId, companyId } = parsed.data;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });
  if (!company) fail(userId, "That company no longer exists.");

  await prisma.user.update({ where: { id: userId }, data: { companyId } });
  await recordAdminAction(prisma, {
    actorUserId: admin.id,
    targetUserId: userId,
    action: "COMPANY_LINKED",
    summary: `Linked to ${company.name}`,
    details: { companyId, companyName: company.name },
  });

  revalidatePath(`/admin/users/${userId}`);
  back(userId, { ok: "company" });
}

export async function unlinkCompany(formData: FormData) {
  const admin = await requireStaff("ADMIN");
  const parsed = resolveSchema.safeParse({ userId: field(formData, "userId") });
  if (!parsed.success) fail(field(formData, "userId"), "Invalid request.");
  const { userId } = parsed.data;

  await prisma.user.update({ where: { id: userId }, data: { companyId: null } });
  await recordAdminAction(prisma, {
    actorUserId: admin.id,
    targetUserId: userId,
    action: "COMPANY_UNLINKED",
    summary: "Unlinked from DentalACE company",
  });

  revalidatePath(`/admin/users/${userId}`);
  back(userId, { ok: "company" });
}

// ── ProTrack tier ────────────────────────────────────────────────────────────

const protrackSchema = z
  .object({
    userId: z.string().uuid(),
    protrackTier: z.enum(["FREE", "PRO"]),
    proExpiresAt: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? new Date(v) : null))
      .refine((d) => d === null || !Number.isNaN(d.getTime()), "Invalid date"),
  })
  .transform((v) => ({
    ...v,
    // FREE never carries an expiry.
    proExpiresAt: v.protrackTier === "FREE" ? null : v.proExpiresAt,
  }));

export async function setProtrackTier(formData: FormData) {
  const admin = await requireStaff("ADMIN");
  const parsed = protrackSchema.safeParse({
    userId: field(formData, "userId"),
    protrackTier: field(formData, "protrackTier"),
    proExpiresAt: field(formData, "proExpiresAt"),
  });
  if (!parsed.success) fail(field(formData, "userId"), parsed.error.issues[0]?.message ?? "Invalid input");
  const { userId, protrackTier, proExpiresAt } = parsed.data;

  await prisma.user.update({
    where: { id: userId },
    data: { protrackTier, proExpiresAt },
  });
  await recordAdminAction(prisma, {
    actorUserId: admin.id,
    targetUserId: userId,
    action: "PROTRACK_TIER_CHANGED",
    summary: `ProTrack tier set to ${protrackTier}`,
    details: { protrackTier, proExpiresAt: proExpiresAt?.toISOString() ?? null },
  });

  revalidatePath(`/admin/users/${userId}`);
  back(userId, { ok: "protrack" });
}

// ── Verify access ────────────────────────────────────────────────────────────

const verifySchema = z.object({
  userId: z.string().uuid(),
  verifyAccess: z.enum(["true", "false"]).transform((v) => v === "true"),
  boardId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
});

export async function setVerifyAccess(formData: FormData) {
  const admin = await requireStaff("ADMIN");
  const parsed = verifySchema.safeParse({
    userId: field(formData, "userId"),
    verifyAccess: field(formData, "verifyAccess"),
    boardId: field(formData, "boardId"),
  });
  if (!parsed.success) fail(field(formData, "userId"), "Invalid Verify change.");
  const { userId, verifyAccess, boardId } = parsed.data;

  if (verifyAccess && boardId) {
    const board = await prisma.board.findUnique({ where: { id: boardId }, select: { id: true } });
    if (!board) fail(userId, "That board no longer exists.");
  }

  // Keep boardId on revoke so re-granting is one click. Only set it when granting.
  await prisma.user.update({
    where: { id: userId },
    data: verifyAccess ? { verifyAccess: true, ...(boardId ? { boardId } : {}) } : { verifyAccess: false },
  });
  await recordAdminAction(prisma, {
    actorUserId: admin.id,
    targetUserId: userId,
    action: "VERIFY_ACCESS_CHANGED",
    summary: verifyAccess ? "Granted Verify access" : "Revoked Verify access",
    details: { verifyAccess, boardId: verifyAccess ? boardId : undefined },
  });

  revalidatePath(`/admin/users/${userId}`);
  back(userId, { ok: "verify" });
}

// ── lifecycle: suspend / unsuspend ───────────────────────────────────────────

export async function suspendAccount(formData: FormData) {
  const admin = await requireStaff("ADMIN");
  const parsed = resolveSchema.safeParse({ userId: field(formData, "userId") });
  if (!parsed.success) fail(field(formData, "userId"), "Invalid request.");
  const { userId } = parsed.data;

  if (userId === admin.id) fail(userId, "You can't suspend your own account.");
  const before = await loadTarget(userId);
  if (!before) fail(userId, "Account not found.");
  if (before.disabledAt) back(userId, { ok: "suspended" });
  if (await isLastEnabledAdmin(userId)) {
    fail(userId, "This is the last active admin and can't be suspended.");
  }

  await prisma.user.update({ where: { id: userId }, data: { disabledAt: new Date() } });
  await recordAdminAction(prisma, {
    actorUserId: admin.id,
    targetUserId: userId,
    action: "ACCOUNT_SUSPENDED",
    summary: `Suspended ${before.email}`,
  });

  revalidatePath(`/admin/users/${userId}`);
  back(userId, { ok: "suspended" });
}

export async function unsuspendAccount(formData: FormData) {
  const admin = await requireStaff("ADMIN");
  const parsed = resolveSchema.safeParse({ userId: field(formData, "userId") });
  if (!parsed.success) fail(field(formData, "userId"), "Invalid request.");
  const { userId } = parsed.data;

  const before = await loadTarget(userId);
  if (!before) fail(userId, "Account not found.");

  await prisma.user.update({ where: { id: userId }, data: { disabledAt: null } });
  await recordAdminAction(prisma, {
    actorUserId: admin.id,
    targetUserId: userId,
    action: "ACCOUNT_UNSUSPENDED",
    summary: `Reinstated ${before.email}`,
  });

  revalidatePath(`/admin/users/${userId}`);
  back(userId, { ok: "unsuspended" });
}

// ── verification & password ──────────────────────────────────────────────────

export async function markEmailVerified(formData: FormData) {
  const admin = await requireStaff("ADMIN");
  const parsed = resolveSchema.safeParse({ userId: field(formData, "userId") });
  if (!parsed.success) fail(field(formData, "userId"), "Invalid request.");
  const { userId } = parsed.data;

  const before = await loadTarget(userId);
  if (!before) fail(userId, "Account not found.");
  if (before.emailVerifiedAt) back(userId, { ok: "verified" });

  await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  // Sign-in checks BOTH the Supabase "Confirm email" gate and emailVerifiedAt,
  // so mirror the confirmation into Auth.
  const sb = createServiceRoleClient();
  await sb.auth.admin.updateUserById(userId, { email_confirm: true }).catch(() => {});

  await recordAdminAction(prisma, {
    actorUserId: admin.id,
    targetUserId: userId,
    action: "EMAIL_VERIFIED_MANUALLY",
    summary: `Manually verified ${before.email}`,
  });

  revalidatePath(`/admin/users/${userId}`);
  back(userId, { ok: "verified" });
}

export async function resendVerification(formData: FormData) {
  const admin = await requireStaff("ADMIN");
  const parsed = resolveSchema.safeParse({ userId: field(formData, "userId") });
  if (!parsed.success) fail(field(formData, "userId"), "Invalid request.");
  const { userId } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, firstName: true, emailVerifiedAt: true },
  });
  if (!user) fail(userId, "Account not found.");
  if (user.emailVerifiedAt) fail(userId, "That account is already verified.");

  const token = signEmailVerificationToken(user.id);
  const verifyUrl = `${resolveBaseUrl()}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: user.email,
    subject: "Confirm your email",
    react: VerifyEmail({ firstName: user.firstName ?? "there", verifyUrl }),
  }).catch((err) => console.error("[resendVerification] email failed", err));
  if (process.env.NODE_ENV !== "production") {
    console.info(`[verify-email:DEV_LINK] ${user.email} -> ${verifyUrl}`);
  }

  await recordAdminAction(prisma, {
    actorUserId: admin.id,
    targetUserId: userId,
    action: "VERIFICATION_RESENT",
    summary: `Resent verification to ${user.email}`,
  });

  revalidatePath(`/admin/users/${userId}`);
  back(userId, { ok: "resent" });
}

export async function sendSetPasswordLink(formData: FormData) {
  const admin = await requireStaff("ADMIN");
  const parsed = resolveSchema.safeParse({ userId: field(formData, "userId") });
  if (!parsed.success) fail(field(formData, "userId"), "Invalid request.");
  const { userId } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, firstName: true, staffRole: true },
  });
  if (!user) fail(userId, "Account not found.");

  const token = signSetPasswordToken(user.id);
  const setPasswordUrl = `${resolveBaseUrl()}/set-password?token=${encodeURIComponent(token)}`;
  const roleLabel =
    user.staffRole === "ADMIN" ? "Admin" : user.staffRole === "REVIEWER" ? "Reviewer" : "account";
  await sendEmail({
    to: user.email,
    subject: StaffInviteEmail.subject(),
    react: StaffInviteEmail({ firstName: user.firstName ?? "there", roleLabel, setPasswordUrl }),
  }).catch((err) => console.error("[sendSetPasswordLink] email failed", err));
  if (process.env.NODE_ENV !== "production") {
    console.info(`[set-password:DEV_LINK] ${user.email} -> ${setPasswordUrl}`);
  }

  await recordAdminAction(prisma, {
    actorUserId: admin.id,
    targetUserId: userId,
    action: "SET_PASSWORD_LINK_SENT",
    summary: `Sent set-password link to ${user.email}`,
  });

  revalidatePath(`/admin/users/${userId}`);
  back(userId, { ok: "setpw" });
}

/**
 * Canonical base URL for outbound links without a request object. Mirrors the
 * logic in lib/app-url.ts: NEXT_PUBLIC_APP_URL, then the production domain, then
 * localhost for dev.
 */
function resolveBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") return "https://dentalace.org";
  return "http://localhost:3000";
}

// ── create account (generalized from provision.ts) ───────────────────────────

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  staffRole: z.enum(["NONE", "REVIEWER", "ADMIN"]),
});

export async function createUserAccount(formData: FormData) {
  const admin = await requireStaff("ADMIN");
  const parsed = createSchema.safeParse({
    email: field(formData, "email"),
    firstName: field(formData, "firstName"),
    lastName: field(formData, "lastName"),
    staffRole: field(formData, "staffRole"),
  });
  if (!parsed.success) {
    redirect(`/admin/users?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }
  const data = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (existing) {
    redirect(`/admin/users?error=${encodeURIComponent("An account with that email already exists.")}`);
  }

  const sb = createServiceRoleClient();
  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email: data.email,
    password: randomUUID() + randomUUID(), // random; never shown — user sets their own
    email_confirm: true,
  });
  if (createErr || !created?.user) {
    redirect(`/admin/users?error=${encodeURIComponent("Could not create the account (email may already exist).")}`);
  }
  const userId = created!.user.id;

  // Roll back the auth user if the row insert fails (mirrors provision.ts).
  try {
    await prisma.user.create({
      data: {
        id: userId,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        staffRole: data.staffRole as StaffRole,
        protrackTier: "FREE",
        emailVerifiedAt: new Date(),
      },
    });
  } catch (err) {
    console.error("[createUserAccount] users-row insert failed; rolling back auth user", err);
    await sb.auth.admin.deleteUser(userId).catch(() => {});
    redirect(`/admin/users?error=${encodeURIComponent("Could not create the account. Please try again.")}`);
  }

  await recordAdminAction(prisma, {
    actorUserId: admin.id,
    targetUserId: userId,
    action: "STAFF_ACCOUNT_CREATED",
    summary: `Created account ${data.email} (${data.staffRole})`,
    details: { staffRole: data.staffRole },
  });

  const token = signSetPasswordToken(userId);
  const setPasswordUrl = `${resolveBaseUrl()}/set-password?token=${encodeURIComponent(token)}`;
  const roleLabel =
    data.staffRole === "ADMIN" ? "Admin" : data.staffRole === "REVIEWER" ? "Reviewer" : "account";
  await sendEmail({
    to: data.email,
    subject: StaffInviteEmail.subject(),
    react: StaffInviteEmail({ firstName: data.firstName, roleLabel, setPasswordUrl }),
  }).catch((err) => console.error("[createUserAccount] invite email failed", err));
  if (process.env.NODE_ENV !== "production") {
    console.info(`[set-password:DEV_LINK] ${data.email} -> ${setPasswordUrl}`);
  }

  revalidatePath("/admin/users");
  redirect(`/admin/users/${userId}?ok=created`);
}
