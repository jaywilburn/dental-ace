"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { rateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { companyRegisterSchema } from "@/lib/company/register-schema";
import {
  companyNameLockKey,
  isUniqueNameViolation,
} from "@/lib/company/register-core";
import { sendEmail } from "@/lib/email/send";
import { appBaseUrl } from "@/lib/app-url";
import CompanyRegisteredEmail from "@/emails/company-registered";

/*
  Server action for self-serve company (CE provider) registration.

  Trust model (per the approved plan): INSTANT ACCESS, no AADB approval step.
  A new company starts with zero credits, so the existing credit gate
  (lib/company/credit-gate.ts) is the real barrier; nothing can be submitted
  until credits are purchased. Duplicate organization names are REJECTED with
  a contact-AADB message, and AADB gets a notification email per registration.

  Flow:
   1. requireUser(); accounts that already belong to a company go to /company.
   2. Rate limit by IP + userId.
   3. Zod-parse the form; bounce validation errors back as a banner.
   4. In a tx with a name-scoped advisory lock: case-insensitive duplicate
      check (the lock serializes same-name registrations, so this check is
      race-free), create the company, and link the user's companyId
      atomically. A P2002 race lands on the same duplicate message.
   5. Notify AADB (AADB_ADMIN_EMAIL) in a try/catch so an email hiccup never
      blocks the registration.
*/

const REGISTER_ROUTE = "/company/register";
const DUPLICATE_SENTINEL = "COMPANY_NAME_TAKEN";
const ALREADY_LINKED_SENTINEL = "USER_ALREADY_LINKED";

export async function registerCompany(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (user.companyId) redirect("/company");

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

  let duplicate = false;
  let companyId: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      // Serialize same-name registrations (case-insensitive) so two
      // simultaneous submissions don't race the find-or-create.
      await tx.$executeRaw`select pg_advisory_xact_lock(${companyNameLockKey(data.name)})`;

      const taken = await tx.company.findFirst({
        where: { name: { equals: data.name, mode: "insensitive" } },
        select: { id: true },
      });
      if (taken) throw new Error(DUPLICATE_SENTINEL);

      const company = await tx.company.create({
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

      // Scoped by companyId IS NULL so a double-submit (second tab, rapid
      // re-click) can't relink an account that just got a company.
      const linked = await tx.user.updateMany({
        where: { id: user.id, companyId: null },
        data: { companyId: company.id },
      });
      if (linked.count !== 1) throw new Error(ALREADY_LINKED_SENTINEL);

      companyId = company.id;
    });
  } catch (err) {
    if (err instanceof Error && err.message === DUPLICATE_SENTINEL) {
      duplicate = true;
    } else if (isUniqueNameViolation(err)) {
      duplicate = true;
    } else if (err instanceof Error && err.message === ALREADY_LINKED_SENTINEL) {
      redirect("/company");
    } else {
      throw err;
    }
  }
  if (duplicate) {
    redirect(`${REGISTER_ROUTE}?error=duplicate`);
  }

  // Notify AADB. Email failure never blocks the registration.
  const adminEmail = process.env.AADB_ADMIN_EMAIL;
  if (adminEmail && companyId) {
    try {
      const h = await headers();
      const proto = h.get("x-forwarded-proto") ?? "https";
      const host = h.get("host") ?? "dentalace.org";
      const adminUrl = `${appBaseUrl(`${proto}://${host}`)}/admin/companies/${companyId}`;
      const props = {
        companyName: data.name,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        address: [
          data.addressLine1,
          data.addressLine2,
          `${data.city}, ${data.state} ${data.zip}`,
        ]
          .filter(Boolean)
          .join(", "),
        registrantName:
          [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
        registrantEmail: user.email,
        registeredAt: new Date().toLocaleString(),
        adminUrl,
      };
      await sendEmail({
        to: adminEmail,
        subject: CompanyRegisteredEmail.subject(props),
        react: CompanyRegisteredEmail(props),
      });
    } catch (err) {
      console.error("[registerCompany] AADB notification email failed", err);
    }
  }

  redirect("/company?just=registered");
}
