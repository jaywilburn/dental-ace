import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { FormCard, FormField, FormLabel, FormTextarea } from "@/components/application-form/form-controls";
import { requireUser } from "@/lib/auth/session";
import { pendingKindsFor } from "@/lib/auth/access-requests";
import { requestStaffAccess } from "./actions";

/*
  Self-serve AADB staff access request at /request-access/staff.

  Sits outside any portal layout so requireUser() is the only gate.
  Submitting creates a PENDING REVIEWER or ADMIN AccessRequest; an AADB
  admin approves or denies it from /admin/access-requests.

  Three states:
    1. User already has staff access → redirect /home (nothing to request).
    2. User has a PENDING REVIEWER or ADMIN request → "under review" panel.
    3. Otherwise → the request form.
*/

const selectClass =
  "w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] text-navy outline-none transition-colors focus:border-ace focus:ring-2 focus:ring-ace/30";

export default async function StaffRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();

  // State 1: already has staff access.
  if (user.staffRole === "REVIEWER" || user.staffRole === "ADMIN") {
    redirect("/home");
  }

  const pending = await pendingKindsFor(user.id);
  const { error } = await searchParams;

  const shell = (children: React.ReactNode) => (
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
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">{children}</div>
    </main>
  );

  // State 2: pending REVIEWER or ADMIN request already exists.
  if (pending.has("REVIEWER") || pending.has("ADMIN")) {
    return shell(
      <div className="rounded-lg border border-border bg-white px-6 py-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-ace/10 text-ace">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="font-serif text-2xl font-bold text-navy">Request under review</h1>
        <p className="mt-3 text-[13px] text-text-muted text-pretty max-w-sm mx-auto">
          Your AADB staff access request is under review. We will email you when it is decided.
        </p>
        <Link
          href="/home"
          className="mt-6 inline-block rounded-md bg-navy px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-navy/90"
        >
          Go to home
        </Link>
      </div>,
    );
  }

  // State 3: show the request form.
  return shell(
    <>
      <h1 className="font-serif text-2xl font-bold text-navy text-balance">
        Request AADB staff access
      </h1>
      <p className="mt-1 max-w-lg text-[13px] text-text-muted text-pretty">
        Submit a request for Reviewer or Admin access. An AADB administrator
        will review and email you when a decision is made.
      </p>

      {error ? (
        <div className="mt-5 rounded-md border border-red-300 bg-red-50 px-4 py-2.5 text-[12px] text-red-700 text-pretty">
          <p className="font-semibold">Your request could not be submitted.</p>
          <p>{error}</p>
        </div>
      ) : null}

      <form action={requestStaffAccess} className="mt-5 space-y-5">
        <FormCard title="Access details">
          <FormField fullWidth>
            <FormLabel required>Access type</FormLabel>
            <select name="kind" className={selectClass} defaultValue="REVIEWER" required>
              <option value="REVIEWER">AADB Reviewer</option>
              <option value="ADMIN">AADB Admin</option>
            </select>
          </FormField>
          <FormField fullWidth>
            <FormLabel>Why do you need this access? (optional)</FormLabel>
            <FormTextarea
              name="note"
              maxLength={500}
              placeholder="Briefly describe your role and why you need access."
            />
          </FormField>
        </FormCard>

        <div className="flex items-center justify-end">
          <button
            type="submit"
            className="rounded-md bg-navy px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-navy/90"
          >
            Request access
          </button>
        </div>
      </form>
    </>,
  );
}
