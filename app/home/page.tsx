import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { pendingKindsFor } from "@/lib/auth/access-requests";
import { BrandMark } from "@/components/brand-mark";

/*
  Platform home/hub. A logged-in account lands here (homePathFor → /home) and
  picks a feature it has access to. Features are derived from entitlements plus
  any PENDING access requests (shows "Under review" status cards).
  ProTrack is always available.
*/
type Feature = {
  href: string;
  title: string;
  desc: string;
  tag?: string;
  tagTone?: "accent" | "muted";
  cta?: string;
};

export default async function HomeHub({
  searchParams,
}: {
  searchParams: Promise<{ requested?: string }>;
}) {
  const [user, { requested }] = await Promise.all([
    requireUser(),
    searchParams,
  ]);
  const pending = await pendingKindsFor(user.id);
  const name = user.firstName ?? user.email;

  const features: Feature[] = [
    {
      href: "/protrack",
      title: "ProTrack",
      desc: "Track your continuing education against your state requirements.",
      tag: user.protrackTier === "PRO" ? "Pro" : "Free",
    },
  ];

  // DentalACE card: full access → pending → register CTA
  if (user.companyId) {
    features.push({
      href: "/company",
      title: "DentalACE",
      desc: "Submit courses for accreditation and issue certificates.",
    });
  } else if (pending.has("COMPANY")) {
    features.push({
      href: "/company",
      title: "DentalACE",
      desc: "Your organization registration is under review. We will email you once a decision is made.",
      tag: "Under review",
      tagTone: "muted",
      cta: "View status",
    });
  } else {
    features.push({
      href: "/company/register",
      title: "DentalACE",
      desc: "Register your organization to submit courses for accreditation and issue certificates.",
      tag: "New",
      cta: "Create your organization",
    });
  }

  // Verify card: full access → pending → omit (no broken pre-account link)
  if (user.verifyAccess) {
    features.push({
      href: "/board",
      title: "Verify",
      desc: "Run random audits, send deficiency notices, and track resolution.",
    });
  } else if (pending.has("BOARD")) {
    features.push({
      href: "/board",
      title: "Verify",
      desc: "Your state board registration is under review. We will email you once a decision is made.",
      tag: "Under review",
      tagTone: "muted",
      cta: "View status",
    });
  }
  // else: omit Verify entirely — no broken pre-account link, no redirect loop

  // Staff cards
  if (user.staffRole === "REVIEWER" || user.staffRole === "ADMIN") {
    features.push({
      href: "/reviewer",
      title: "Review Queue",
      desc: "Review and approve course applications.",
    });
  } else if (pending.has("REVIEWER") || pending.has("ADMIN")) {
    features.push({
      href: "/request-access/staff",
      title: "AADB Staff",
      desc: "Your staff access request is under review.",
      tag: "Under review",
      tagTone: "muted",
      cta: "View status",
    });
  }

  if (user.staffRole === "ADMIN") {
    features.push({
      href: "/admin",
      title: "Admin",
      desc: "Platform administration and overrides.",
    });
  }

  return (
    <main className="min-h-dvh bg-surface">
      <header className="flex items-center justify-between bg-navy px-6 py-4 text-white">
        <BrandMark tag="AADB" />
        <form action="/api/auth/signout" method="POST">
          <button
            type="submit"
            className="rounded-md border border-white/15 px-3 py-1.5 text-[11px] font-semibold text-white/70 transition hover:border-white/30 hover:text-white"
          >
            Sign out
          </button>
        </form>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-10">
        {requested === "staff" && (
          <div className="mb-6 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-[13px] text-emerald-800">
            Your staff access request was submitted. We will email you when
            it&#39;s decided.
          </div>
        )}

        <h1 className="font-serif text-2xl font-bold text-navy text-balance">
          Welcome back, {name}
        </h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Choose a feature to continue.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {features.map((f) => (
            <a
              key={f.href}
              href={f.href}
              className="rounded-xl border border-border bg-white p-5 transition hover:border-ace hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-lg font-semibold text-navy">
                  {f.title}
                </h2>
                {f.tag ? (
                  <span
                    className={
                      f.tagTone === "muted"
                        ? "rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
                        : "rounded-full bg-ace-bg px-2 py-0.5 text-[10px] font-semibold text-ace-dark"
                    }
                  >
                    {f.tag}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-[12px] text-text-muted text-pretty">
                {f.desc}
              </p>
              <span className="mt-3 inline-block text-[12px] font-semibold text-ace-dark">
                {f.cta ?? "Open"} →
              </span>
            </a>
          ))}
        </div>

        {user.staffRole === "NONE" &&
        !pending.has("REVIEWER") &&
        !pending.has("ADMIN") ? (
          <p className="mt-6 text-center text-[12px] text-text-muted">
            AADB staff?{" "}
            <Link
              href="/request-access/staff"
              className="font-semibold text-ace-dark hover:underline"
            >
              Request reviewer or admin access
            </Link>
          </p>
        ) : null}
      </div>
    </main>
  );
}
