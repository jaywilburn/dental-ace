"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/*
  Sticky top nav for the landing. Navy bg with backdrop blur. Brand mark
  (text-only, no img asset yet) + "AADB Program" badge on the left, product
  anchor links in the middle (color-coded per product), Sign In button on
  the right. Nav links hide below md; a disclosure menu (hamburger toggle)
  exposes the same links below md instead.
*/

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ace-light focus-visible:ring-offset-2 focus-visible:ring-offset-navy";

// Anchors are root-relative (/#ace) so the nav works from any page, not just
// the landing page. On the homepage these still scroll to the section.
const navLinks: { label: string; href: string; color?: "ace" | "pro" | "ver" }[] = [
  { label: "DentalACE", href: "/#ace", color: "ace" },
  { label: "ProTrack", href: "/#protrack", color: "pro" },
  { label: "Verify", href: "/#verify", color: "ver" },
  { label: "VerifyIQ", href: "/verifyiq", color: "ver" },
  { label: "How it works", href: "/how-it-works" },
  { label: "About", href: "/about" },
];

// Shared so the desktop cluster and the mobile disclosure menu never drift
// out of sync on per-product link coloring.
function linkColorClass(color?: "ace" | "pro" | "ver") {
  if (color === "ace") return "text-ace-light";
  if (color === "pro") return "text-pro-light";
  if (color === "ver") return "text-ver-light";
  return "text-white/65";
}

export function LandingNav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-white/[0.07] bg-navy/95 backdrop-blur">
      {/* Links are absolutely centered on the viewport so the unequal widths of
          the brand mark (left) and Sign In button (right) don't pull them off
          center, which justify-between alone would do. */}
      <div className="relative flex h-16 items-center justify-between px-5 md:px-10">
        <div className="flex items-center gap-3">
          <span className="font-serif text-xl font-bold text-white">
            Dental<span className="text-ace-light">ACE</span> One
          </span>
          <span className="hidden rounded border border-white/[0.15] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[2px] text-white/45 sm:inline-block">
            AADB Program
          </span>
        </div>

        <div className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors hover:bg-white/[0.07] hover:text-white",
                linkColorClass(link.color),
                focusRing,
              )}
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className={cn(
              "rounded-lg bg-ace px-4 py-1.5 text-[13px] font-semibold text-navy transition-colors hover:bg-ace-light",
              focusRing,
            )}
          >
            Sign In
          </Link>
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
            aria-controls="landing-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className={cn(
              "flex size-9 items-center justify-center rounded-md text-white/80 hover:bg-white/[0.07] hover:text-white md:hidden",
              focusRing,
            )}
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
        </div>
      </div>

      {open ? (
        <div
          id="landing-menu"
          className="flex flex-col gap-1 border-t border-white/[0.07] px-5 pb-4 pt-2 md:hidden"
        >
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-white/[0.07] hover:text-white",
                linkColorClass(link.color),
                focusRing,
              )}
            >
              {link.label}
            </a>
          ))}
        </div>
      ) : null}
    </nav>
  );
}
