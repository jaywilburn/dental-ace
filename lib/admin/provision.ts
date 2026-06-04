"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { signSetPasswordToken } from "@/lib/auth/set-password-token";
import { sendEmail } from "@/lib/email/send";
import StaffInviteEmail from "@/emails/staff-invite";

/*
  Admin staff provisioning. Creates a Supabase Auth user (service-role, random
  password, email pre-confirmed) + a users row with the chosen staff_role and
  email_verified_at set, then emails a signed set-password link. setStaffRole
  promotes/revokes on existing accounts.
*/

const createSchema = z.object({
  email: z.string().email().max(200),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  staffRole: z.enum(["REVIEWER", "ADMIN"]),
});

/**
 * Resolve the canonical base URL for outbound links (e.g., emailed set-password
 * links) without a live request object. Mirrors the logic in lib/app-url.ts:
 * prefers NEXT_PUBLIC_APP_URL, then the production domain, then localhost for dev.
 */
function resolveBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") return "https://dentalace.org";
  return "http://localhost:3000";
}

export async function createStaffAccount(formData: FormData) {
  await requireStaff("ADMIN");
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

  const admin = createServiceRoleClient();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: data.email,
    password: randomUUID() + randomUUID(), // random; never shown — staffer sets their own
    email_confirm: true,
  });
  if (createErr || !created?.user) {
    redirect(`/admin/users?error=${encodeURIComponent("Could not create the account (email may already exist).")}`);
  }
  const userId = created!.user.id;

  await prisma.user.create({
    data: {
      id: userId,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      staffRole: data.staffRole,
      protrackTier: "FREE",
      emailVerifiedAt: new Date(),
    },
  });

  const token = signSetPasswordToken(userId);
  const setPasswordUrl = `${resolveBaseUrl()}/set-password?token=${encodeURIComponent(token)}`;
  try {
    await sendEmail({
      to: data.email,
      subject: StaffInviteEmail.subject(),
      react: StaffInviteEmail({
        firstName: data.firstName,
        roleLabel: data.staffRole === "ADMIN" ? "Admin" : "Reviewer",
        setPasswordUrl,
      }),
    });
  } catch (err) {
    console.error("[createStaffAccount] invite email failed", err);
  }

  revalidatePath("/admin/users");
  redirect("/admin/users?ok=created");
}

export async function setStaffRole(formData: FormData) {
  await requireStaff("ADMIN");
  const userId = field(formData, "userId");
  const staffRole = field(formData, "staffRole");
  if (!userId || !["NONE", "REVIEWER", "ADMIN"].includes(staffRole)) {
    redirect(`/admin/users?error=${encodeURIComponent("Invalid role change.")}`);
  }
  await prisma.user.update({
    where: { id: userId },
    data: { staffRole: staffRole as "NONE" | "REVIEWER" | "ADMIN" },
  });
  revalidatePath("/admin/users");
  redirect("/admin/users?ok=role");
}

function field(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "");
}
