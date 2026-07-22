"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/*
  Mobile disclosure wrapper for the portal sidebar. PortalShell (server
  component) renders the sidebar's contents (brand block, avatar row,
  SidebarNav, switch links, sign-out form) as `children` here unchanged; this
  component only adds a sticky mobile top bar + toggle that shows/hides the
  aside below md. Expansion is in-flow (pushes the main content down), no
  overlay. Closes automatically on navigation (render-phase reset below).
*/
export function PortalSidebar({
  topBarBrand,
  children,
}: {
  topBarBrand: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on navigation. State is adjusted during render (React's documented
  // pattern for resetting state when a value changes) instead of in an effect,
  // which would commit the open menu first and re-render to close it.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  return (
    <>
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-white/[0.07] bg-navy px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] text-white md:hidden">
        {topBarBrand}
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-controls="portal-sidebar"
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          className="-mr-1 flex size-9 items-center justify-center rounded-md text-white/80 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ace-light"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            className="size-5"
            aria-hidden="true"
          >
            <path d={open ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16"} />
          </svg>
        </button>
      </header>

      <aside
        id="portal-sidebar"
        className={cn("flex-col bg-navy text-white", open ? "flex" : "hidden md:flex")}
      >
        {children}
      </aside>
    </>
  );
}
