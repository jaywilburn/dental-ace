import { cn } from "@/lib/utils";

/*
  Shared hero for the static marketing pages (about, how-it-works, pricing,
  contact, privacy). Navy band with a soft radial blob tinted to the page's
  accent product color, a mono eyebrow, a serif headline, and an optional sub.
  Matches the landing hero's visual language without its product-card payload.
*/

type Accent = "ace" | "pro" | "ver";

const blobColor: Record<Accent, string> = {
  ace: "rgba(200,151,26,0.10)",
  pro: "rgba(13,148,136,0.10)",
  ver: "rgba(43,108,176,0.12)",
};

const eyebrowColor: Record<Accent, string> = {
  ace: "text-ace-light",
  pro: "text-pro-light",
  ver: "text-ver-light",
};

export function PageHero({
  eyebrow,
  title,
  sub,
  accent = "ace",
}: {
  eyebrow: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  accent?: Accent;
}) {
  return (
    <section className="relative overflow-hidden bg-navy px-5 py-16 text-center md:px-10 md:py-24">
      <div
        aria-hidden
        style={{
          background: `radial-gradient(circle, ${blobColor[accent]} 0%, transparent 70%)`,
        }}
        className="pointer-events-none absolute left-1/2 top-0 size-[600px] -translate-x-1/2 -translate-y-1/3 rounded-full"
      />
      <p
        className={cn(
          "relative z-10 mb-3 font-mono text-[11px] uppercase tracking-[2.5px]",
          eyebrowColor[accent],
        )}
      >
        {eyebrow}
      </p>
      <h1 className="relative z-10 mx-auto max-w-[760px] text-balance font-serif text-4xl font-bold text-white md:text-[52px] md:leading-[1.08]">
        {title}
      </h1>
      {sub ? (
        <p className="relative z-10 mx-auto mt-5 max-w-[600px] text-pretty text-base leading-relaxed text-white/45 md:text-lg">
          {sub}
        </p>
      ) : null}
    </section>
  );
}
