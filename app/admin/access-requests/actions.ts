"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireStaff } from "@/lib/auth/session";
import { approveRequest, denyRequest } from "@/lib/auth/access-requests";

export async function approveAction(formData: FormData): Promise<void> {
  const admin = await requireStaff("ADMIN");
  const id = String(formData.get("id") ?? "");
  const origin = (await headers()).get("origin") ?? "https://www.dentalace.org";
  const r = await approveRequest(id, admin.id, origin);
  redirect(r.ok ? "/admin/access-requests?done=approved" : `/admin/access-requests?error=${encodeURIComponent(r.message)}`);
}

export async function denyAction(formData: FormData): Promise<void> {
  const admin = await requireStaff("ADMIN");
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const r = await denyRequest(id, admin.id, reason);
  redirect(r.ok ? "/admin/access-requests?done=denied" : `/admin/access-requests?error=${encodeURIComponent(r.message)}`);
}
