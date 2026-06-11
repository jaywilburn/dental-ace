import { requireUser } from "@/lib/auth/session";
import { BrandMark } from "@/components/brand-mark";

/*
  Platform home/hub. A logged-in account lands here (homePathFor → /home) and
  picks a feature it has access to. Features are derived from entitlements:
  ProTrack is always available; DentalACE/staff/Verify areas appear per entitlement.
*/
type Feature = { href: string; title: string; desc: string; tag?: string; cta?: string };

export default async function HomeHub() {
  const user = await requireUser();
  const name = user.firstName ?? user.email;

  const features: Feature[] = [
    {
      href: "/protrack",
      title: "ProTrack",
      desc: "Track your continuing education against your state requirements.",
      tag: user.protrackTier === "PRO" ? "Pro" : "Free",
    },
  ];
  if (user.companyId) {
    features.push({
      href: "/company",
      title: "DentalACE",
      desc: "Submit courses for accreditation and issue certificates.",
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
  if (user.verifyAccess) {
    features.push({
      href: "/board",
      title: "Verify",
      desc: "Run random audits, send deficiency notices, and track resolution.",
    });
  }
  if (user.staffRole === "REVIEWER" || user.staffRole === "ADMIN") {
    features.push({
      href: "/reviewer",
      title: "Review Queue",
      desc: "Review and approve course applications.",
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
                  <span className="rounded-full bg-ace-bg px-2 py-0.5 text-[10px] font-semibold text-ace-dark">
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
      </div>
    </main>
  );
}
