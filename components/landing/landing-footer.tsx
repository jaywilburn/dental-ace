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
  { label: "DentalACE", href: "/company", color: "ace" },
  { label: "ProTrack", href: "/protrack", color: "pro" },
  { label: "Verify", href: "/verify", color: "ver" },
  { label: "VerifyIQ", href: "/verifyiq", color: "ver" },
];

const forYou: FooterLink[] = [
  { label: "CE Providers", href: "/company" },
  { label: "Dental Professionals", href: "/signup" },
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
      <p className="mb-3.5 font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-white/50">
        {title}
      </p>
      <ul className="flex flex-col gap-2">
        {links.map((link) => (
          <li key={link.href + link.label}>
            <Link
              href={link.href}
              className={cn(
                "inline-block py-0.5 text-[13px] transition-colors hover:text-white",
                link.color === "ace" && "text-ace-light",
                link.color === "pro" && "text-pro-light",
                link.color === "ver" && "text-ver-light",
                !link.color && "text-white/65",
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
    <footer className="bg-[#060f1c]">
      <div className="mx-auto grid max-w-[1100px] gap-8 px-5 pb-8 pt-12 md:grid-cols-2 md:gap-10 md:px-10 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <div>
          <p className="mb-2 font-serif text-[22px] font-bold text-white">
            Dental<span className="text-ace-light">ACE</span> One
          </p>
          <p className="mb-4 max-w-[240px] text-pretty text-xs leading-relaxed text-white/55">
            The complete dental continuing education platform, operated by the
            American Association of Dental Boards.
          </p>
        </div>
        <FooterColumn title="Products" links={products} />
        <FooterColumn title="For You" links={forYou} />
        <FooterColumn title="Info" links={info} />
      </div>
      <div className="border-t border-white/[0.07]">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-2 px-5 py-5 text-[11px] text-white/50 md:px-10">
          <span>
            © {year} American Association of Dental Boards · dentalace.org
          </span>
          <a
            href="mailto:info@dentalace.org"
            className={cn("text-white/60 hover:text-white", focusRing)}
          >
            info@dentalace.org
          </a>
        </div>
      </div>
    </footer>
  );
}
