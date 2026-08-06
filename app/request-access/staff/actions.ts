"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth/session";
import { createRequest } from "@/lib/auth/access-requests";

export async function requestStaffAccess(formData: FormData): Promise<void> {
  const user = await requireUser();
  const kindRaw = String(formData.get("kind") ?? "");
  const kind = kindRaw === "ADMIN" ? "ADMIN" : "REVIEWER"; // never trust beyond these two
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || undefined;
  const origin = (await headers()).get("origin") ?? "https://www.dentalace.org";
  const result = await createRequest(
    { id: user.id, email: user.email, firstName: user.firstName },
    kind, {}, note, origin,
  );
  redirect(result.ok ? "/home?requested=staff" : `/request-access/staff?error=${encodeURIComponent(result.message)}`);
}
