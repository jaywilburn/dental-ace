import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { PortalSidebar } from "@/components/portal-sidebar";
import { SidebarNav } from "@/components/sidebar-nav";
import type { NavItem, NavSection } from "@/lib/nav/portal-nav";

/*
  Two-column portal shell: navy sidebar + light main area.
  Matches the .shell / .sidebar / .main pattern from the v3 mockup.

  - `nav` drives the sidebar items (per-role config in lib/nav/portal-nav.ts);
    SidebarNav highlights the active item from the current path
  - `product` switches the brand wordmark (ace / pro / ver)
  - `userInitials` renders the gold avatar; `userName`/`userRole` go below it
  - `switchLinks` / `homeHref` render a footer above Sign Out (product portals
    only): links to the account's other products, then "Back to Home"
*/
export function PortalShell({
  nav,
  product = "ace",
  userInitials,
  userName,
  userRole,
  switchLinks,
  homeHref,
  children,
}: {
  nav: NavSection[];
  product?: "ace" | "pro" | "ver";
  userInitials: string;
  userName: string;
  userRole: string;
  switchLinks?: NavItem[];
  homeHref?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh grid-cols-1 bg-surface md:grid-cols-[220px_1fr]">
      <PortalSidebar topBarBrand={<BrandMark size="sm" product={product} />}>
        <div className="hidden border-b border-white/[0.07] px-4 pb-3.5 pt-4 md:block">
          <BrandMark tag="AADB" product={product} />
        </div>

        <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ace font-bold text-[11px] text-navy">
            {userInitials}
          </div>
          <div>
            <div className="text-[11px] font-semibold">{userName}</div>
            <div className="text-[10px] text-white/35">{userRole}</div>
          </div>
        </div>

        <SidebarNav nav={nav} />

        {(switchLinks?.length || homeHref) && (
          <div className="border-t border-white/[0.07] px-2 py-2">
            {switchLinks?.length ? (
              <>
                <div className="px-2 pb-1 pt-1 font-mono text-[9px] uppercase tracking-[2px] text-white/20">
                  Switch product
                </div>
                {switchLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-medium text-white/50 transition hover:bg-white/[0.04] hover:text-white"
                  >
                    <span className="text-sm">{link.icon}</span>
                    {link.label}
                  </Link>
                ))}
              </>
            ) : null}
            {homeHref ? (
              <Link
                href={homeHref}
                className="mt-0.5 flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-medium text-white/50 transition hover:bg-white/[0.04] hover:text-white"
              >
                <span className="text-sm">←</span>
                Back to Home
              </Link>
            ) : null}
          </div>
        )}

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
      </PortalSidebar>

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
