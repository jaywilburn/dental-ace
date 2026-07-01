import Link from "next/link";
import { cn } from "@/lib/utils";

/*
  Sticky top nav for the landing. Navy bg with backdrop blur. Brand mark
  (text-only, no img asset yet) + "AADB Program" badge on the left, product
  anchor links in the middle (color-coded per product), Sign In button on
  the right. Nav links hide below md so only brand + Sign In show on mobile.
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

export function LandingNav() {
  return (
    <nav className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-white/[0.07] bg-navy/95 px-5 backdrop-blur md:px-10">
      {/* Links are absolutely centered on the viewport so the unequal widths of
          the brand mark (left) and Sign In button (right) don't pull them off
          center, which justify-between alone would do. */}
      <div className="flex items-center gap-3">
        <span className="font-serif text-xl font-bold text-white">
          Dental<span className="text-ace-light">ACE</span> One
        </span>
        <span className="rounded border border-white/[0.15] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[2px] text-white/45">
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
              link.color === "ace" && "text-ace-light",
              link.color === "pro" && "text-pro-light",
              link.color === "ver" && "text-ver-light",
              !link.color && "text-white/65",
              focusRing,
            )}
          >
            {link.label}
          </a>
        ))}
      </div>

      <Link
        href="/login"
        className={cn(
          "rounded-lg bg-ace px-4 py-1.5 text-[13px] font-semibold text-navy transition-colors hover:bg-ace-light",
          focusRing,
        )}
      >
        Sign In
      </Link>
    </nav>
  );
}
