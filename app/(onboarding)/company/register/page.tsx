import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import {
  FormCard,
  FormField,
  FormInput,
  FormLabel,
} from "@/components/application-form/form-controls";
import { requireUser } from "@/lib/auth/session";
import { STATE_CODES, US_STATES } from "@/lib/protrack/reference";
import { registerCompany } from "@/lib/company/register-actions";
import { DUPLICATE_COMPANY_MESSAGE } from "@/lib/company/register-core";

/*
  Self-serve company (CE provider) registration at /company/register.

  Lives in the (onboarding) route group, NOT under app/company/, because the
  company layout's requireDentalAce() would bounce accounts without a
  companyId to /home before they could ever register. Same URL, no portal
  shell, requireUser() floor.

  Instant access by design: the new company starts with zero credits, so the
  credit gate (lib/company/credit-gate.ts) is the real barrier to submitting
  applications.
*/

const selectClass =
  "w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] text-navy outline-none transition-colors focus:border-ace focus:ring-2 focus:ring-ace/30";

const STATES_BY_NAME = [...STATE_CODES].sort((a, b) =>
  US_STATES[a]!.localeCompare(US_STATES[b]!),
);

export default async function CompanyRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  const user = await requireUser();
  if (user.companyId) redirect("/company");

  const { error, detail } = await searchParams;
  const errorMessage =
    error === "duplicate"
      ? DUPLICATE_COMPANY_MESSAGE
      : error === "rate_limited"
        ? "Too many attempts. Please wait a bit and try again."
        : error === "validation"
          ? (detail ?? "Check that every required field is filled in, then try again.")
          : null;

  return (
    <main className="min-h-dvh bg-surface">
      <header className="flex items-center justify-between bg-navy px-6 py-4 text-white">
        <BrandMark tag="AADB" />
        <Link
          href="/home"
          className="rounded-md border border-white/15 px-3 py-1.5 text-[11px] font-semibold text-white/70 transition hover:border-white/30 hover:text-white"
        >
          Back to home
        </Link>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <h1 className="font-serif text-2xl font-bold text-navy text-balance">
          Register your organization
        </h1>
        <p className="mt-1 max-w-lg text-[13px] text-text-muted text-pretty">
          Set up your organization to submit courses for AADB accreditation and
          issue certificates with DentalACE. You can buy application credits
          right after registering.
        </p>

        {errorMessage ? (
          <div className="mt-5 rounded-md border border-red-300 bg-red-50 px-4 py-2.5 text-[12px] text-red-700 text-pretty">
            <p className="font-semibold">Your organization could not be registered.</p>
            <p>{errorMessage}</p>
          </div>
        ) : null}

        <form action={registerCompany} className="mt-5 space-y-5">
          <FormCard title="Organization">
            <FormField fullWidth>
              <FormLabel required>Organization Name</FormLabel>
              <FormInput
                name="name"
                required
                minLength={2}
                maxLength={200}
                placeholder="Texas Dental Association"
              />
            </FormField>
            <FormField>
              <FormLabel required>Contact Email</FormLabel>
              <FormInput
                name="contactEmail"
                type="email"
                required
                maxLength={200}
                defaultValue={user.email}
              />
            </FormField>
            <FormField>
              <FormLabel>Contact Phone</FormLabel>
              <FormInput
                name="contactPhone"
                type="tel"
                maxLength={40}
                placeholder="(555) 555-0100"
              />
            </FormField>
          </FormCard>

          <FormCard title="Mailing Address">
            <FormField fullWidth>
              <FormLabel required>Street Address</FormLabel>
              <FormInput
                name="addressLine1"
                required
                minLength={3}
                maxLength={200}
                autoComplete="address-line1"
              />
            </FormField>
            <FormField fullWidth>
              <FormLabel>Suite / Unit</FormLabel>
              <FormInput
                name="addressLine2"
                maxLength={200}
                autoComplete="address-line2"
              />
            </FormField>
            <FormField>
              <FormLabel required>City</FormLabel>
              <FormInput
                name="city"
                required
                minLength={2}
                maxLength={100}
                autoComplete="address-level2"
              />
            </FormField>
            <FormField>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FormLabel required>State</FormLabel>
                  <select
                    name="state"
                    className={selectClass}
                    defaultValue=""
                    required
                  >
                    <option value="" disabled>
                      Pick a state
                    </option>
                    {STATES_BY_NAME.map((code) => (
                      <option key={code} value={code}>
                        {US_STATES[code]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <FormLabel required>ZIP</FormLabel>
                  <FormInput
                    name="zip"
                    required
                    pattern="\d{5}(-\d{4})?"
                    maxLength={10}
                    placeholder="78701"
                    autoComplete="postal-code"
                  />
                </div>
              </div>
            </FormField>
          </FormCard>

          <div className="flex items-center justify-end">
            <button
              type="submit"
              className="rounded-md bg-navy px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-navy/90"
            >
              Register Organization
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
