import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/utils";
import type { NavSection } from "@/lib/nav/portal-nav";

/*
  Two-column portal shell: navy sidebar + light main area.
  Matches the .shell / .sidebar / .main pattern from the v3 mockup.

  - `nav` drives the sidebar items (per-role config in lib/nav/portal-nav.ts)
  - `activeHref` highlights the matching item
  - `userInitials` renders the gold avatar; `userName`/`userRole` go below it
*/
export function PortalShell({
  nav,
  activeHref,
  userInitials,
  userName,
  userRole,
  children,
}: {
  nav: NavSection[];
  activeHref: string;
  userInitials: string;
  userName: string;
  userRole: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen grid-cols-1 bg-surface md:grid-cols-[220px_1fr]">
      <aside className="flex flex-col bg-navy text-white">
        <div className="border-b border-white/[0.07] px-4 pb-3.5 pt-4">
          <BrandMark tag="AADB" />
        </div>

        <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ace font-bold text-[11px] text-navy">
            {userInitials}
          </div>
          <div>
            <div className="text-[11px] font-semibold">{userName}</div>
            <div className="text-[10px] text-white/35">{userRole}</div>
          </div>
        </div>

        <nav className="flex-1 py-3">
          {nav.map((section, i) => (
            <div key={i}>
              {section.label ? (
                <div className="px-4 pb-1 pt-2 font-mono text-[9px] uppercase tracking-[2px] text-white/20">
                  {section.label}
                </div>
              ) : null}
              {section.items.map((item) => {
                const isActive = item.href === activeHref;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 border-l-2 border-transparent px-4 py-1.5 text-[11px] font-medium text-white/50 transition hover:bg-white/[0.04] hover:text-white",
                      isActive &&
                        "border-ace bg-ace/[0.1] text-white hover:bg-ace/[0.15]",
                    )}
                  >
                    <span className="text-sm">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <form
          action="/api/auth/signout"
          method="POST"
          className="border-t border-white/[0.07] p-4"
        >
          <button
            type="submit"
            className="w-full rounded-md border border-white/15 bg-transparent px-3 py-2 text-[11px] font-semibold text-white/70 transition hover:border-white/30 hover:text-white"
          >
            Sign out
          </button>
        </form>
      </aside>

      <main className="overflow-y-auto bg-surface px-7 py-6">{children}</main>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-navy">{title}</h1>
        {subtitle ? (
          <p className="mt-0.5 text-[11px] text-text-muted">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
