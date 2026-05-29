import Link from "next/link";
import { cn } from "@/lib/utils";

/*
  Footer: 4-col grid on desktop, 2-col on tablet, 1-col on mobile.
  Background is a deeper navy than the main --navy (#060f1c) to anchor the
  page. Bottom bar shows dynamic copyright year + email.
*/

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ace-light focus-visible:ring-offset-2 focus-visible:ring-offset-[#060f1c] rounded-sm";

type FooterLink = { label: string; href: string; color?: "ace" | "pro" | "ver" };

const products: FooterLink[] = [
  { label: "Dental ACE", href: "/company", color: "ace" },
  { label: "ProTrack", href: "/protrack", color: "pro" },
  { label: "Verify", href: "/verify", color: "ver" },
];

const forYou: FooterLink[] = [
  { label: "CE Providers", href: "/company" },
  { label: "Dental Professionals", href: "/protrack/register" },
  { label: "State Boards", href: "/verify/contact" },
  { label: "Sign In", href: "/login" },
];

const info: FooterLink[] = [
  { label: "About AADB", href: "/about" },
  { label: "How it works", href: "/how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "Contact", href: "/contact" },
  { label: "Privacy Policy", href: "/privacy" },
];

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div>
      <p className="mb-3.5 font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-white/25">
        {title}
      </p>
      <ul className="flex flex-col gap-2.5">
        {links.map((link) => (
          <li key={link.href + link.label}>
            <Link
              href={link.href}
              className={cn(
                "text-[13px] transition-colors hover:text-white",
                link.color === "ace" && "text-ace/70",
                link.color === "pro" && "text-pro/70",
                link.color === "ver" && "text-ver/70",
                !link.color && "text-white/45",
                focusRing,
              )}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LandingFooter() {
  const year = new Date().getFullYear();

  return (
    <>
      <footer className="grid gap-7 bg-[#060f1c] px-5 pb-8 pt-12 md:grid-cols-2 md:gap-10 md:px-10 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <div>
          <p className="mb-2 font-serif text-[22px] font-bold text-white">
            Dental <span className="text-ace-light">ACE</span>
          </p>
          <p className="mb-4 max-w-[220px] text-pretty text-xs leading-relaxed text-white/30">
            An AADB program, the complete dental continuing education platform.
          </p>
          <span className="inline-block rounded border border-white/10 px-2.5 py-0.5 font-mono text-[10px] text-white/30">
            Powered by CE Exchange
          </span>
        </div>
        <FooterColumn title="Products" links={products} />
        <FooterColumn title="For You" links={forYou} />
        <FooterColumn title="Info" links={info} />
      </footer>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.05] bg-[#060f1c] px-5 py-5 text-[11px] text-white/20 md:px-10">
        <span>
          © {year} Dental Exchange, Inc. d/b/a CE Exchange · An AADB Program ·
          dentalace.org
        </span>
        <a
          href="mailto:info@dentalace.org"
          className={cn("hover:text-white/50", focusRing)}
        >
          info@dentalace.org
        </a>
      </div>
    </>
  );
}
