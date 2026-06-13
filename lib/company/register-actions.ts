"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { rateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { companyRegisterSchema } from "@/lib/company/register-schema";
import { createRequest, pendingKindsFor } from "@/lib/auth/access-requests";

/*
  Server action for self-serve company (CE provider) registration.

  As of Task 8, registration no longer grants instant access. Instead it
  creates a PENDING AccessRequest of kind "COMPANY". The actual company
  creation and companyId linkage happens when an AADB admin approves the
  request via approveRequest() -> applyCompanyGrant().

  Flow:
   1. requireUser(); accounts that already belong to a company go to /company.
   2. Accounts with an open COMPANY request see the submitted state.
   3. Rate limit by IP + userId.
   4. Zod-parse the form; bounce validation errors back as a banner.
   5. createRequest() validates the payload a second time (backstop), inserts
      the AccessRequest row, and fires the confirmation + admin-notify emails.
   6. Redirect to the submitted state.
*/

const REGISTER_ROUTE = "/company/register";

export async function registerCompany(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (user.companyId) redirect("/company");
  if ((await pendingKindsFor(user.id)).has("COMPANY")) redirect(`${REGISTER_ROUTE}?submitted=1`);

  const ip = ((await headers()).get("x-forwarded-for") ?? "unknown")
    .split(",")[0]
    .trim();
  const limited = rateLimit(`company-register:${ip}:${user.id}`, {
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!limited.ok) {
    redirect(`${REGISTER_ROUTE}?error=rate_limited`);
  }

  const result = companyRegisterSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    contactEmail: String(formData.get("contactEmail") ?? ""),
    contactPhone: String(formData.get("contactPhone") ?? ""),
    addressLine1: String(formData.get("addressLine1") ?? ""),
    addressLine2: String(formData.get("addressLine2") ?? ""),
    city: String(formData.get("city") ?? ""),
    state: String(formData.get("state") ?? ""),
    zip: String(formData.get("zip") ?? ""),
  });
  if (!result.success) {
    const issue = result.error.issues[0];
    const detail = issue
      ? `${String(issue.path[0] ?? "Form")}: ${issue.message}`.slice(0, 200)
      : "Please check the highlighted fields.";
    redirect(
      `${REGISTER_ROUTE}?error=validation&detail=${encodeURIComponent(detail)}`,
    );
  }
  const data = result.data;

  const created = await createRequest(
    { id: user.id, email: user.email, firstName: user.firstName },
    "COMPANY",
    {
      name: data.name,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2,
      city: data.city,
      state: data.state,
      zip: data.zip,
    },
    undefined,
    (await headers()).get("origin") ?? "https://dentalace.org",
  );
  if (!created.ok) {
    redirect(`${REGISTER_ROUTE}?error=validation&detail=${encodeURIComponent(created.message)}`);
  }
  redirect(`${REGISTER_ROUTE}?submitted=1`);
}
