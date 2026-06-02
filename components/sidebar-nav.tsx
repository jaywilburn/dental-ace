"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavSection } from "@/lib/nav/portal-nav";

/*
  Sidebar nav list. Highlights the item whose href is the longest prefix match
  of the current path, so /protrack/certificates lights up "My Certificates"
  rather than the "/protrack" dashboard. Client component because layouts can't
  read the pathname in the App Router.
*/
export function SidebarNav({ nav }: { nav: NavSection[] }) {
  const pathname = usePathname();

  const activeHref =
    nav
      .flatMap((s) => s.items)
      .filter(
        (i) =>
          i.href !== "#" &&
          (pathname === i.href || pathname.startsWith(i.href + "/")),
      )
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;

  return (
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
                aria-current={isActive ? "page" : undefined}
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
  );
}
