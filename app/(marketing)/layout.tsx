import { LandingNav } from "@/components/landing/landing-nav";
import { LandingFooter } from "@/components/landing/landing-footer";

/*
  Shell for the static marketing pages (about, how-it-works, pricing, contact,
  privacy). Reuses the landing nav + footer so these pages stay visually
  consistent with the homepage. This is a route group: the (marketing) segment
  does not appear in the URL, so paths remain /about, /pricing, etc. The
  homepage at app/page.tsx is outside this group and composes its own nav.
*/
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <LandingNav />
      <main>{children}</main>
      <LandingFooter />
    </>
  );
}
