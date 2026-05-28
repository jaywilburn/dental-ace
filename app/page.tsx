/*
  Phase 0 brand-verification page. Renders a representative slice of the AADB
  design system so we can visually confirm the tokens match the prototypes
  before any real UI work. Replaced when the real landing page is built (Phase 1).
*/
export default function Home() {
  return (
    <main className="min-h-screen bg-navy text-white">
      <div className="mx-auto max-w-5xl px-8 py-20">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-gold-light">
          AADB · Phase 0
        </p>
        <h1 className="mt-3 font-serif text-5xl font-bold leading-tight">
          Dental <span className="text-gold-light">ACE</span>
          <span className="text-text-muted"> · </span>
          Track
          <span className="text-text-muted"> · </span>
          Audit
        </h1>
        <p className="mt-4 max-w-xl text-sm text-white/60">
          Brand-verification page. If the navy, gold accent, serif heading, and
          mono eyebrow all look right, the design system is wired up correctly.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-gold/30 bg-navy p-5">
            <p className="font-mono text-[10px] uppercase tracking-[2px] text-gold-light">
              Product 01
            </p>
            <p className="mt-2 font-serif text-2xl font-bold">Dental ACE</p>
            <p className="mt-1 text-xs text-white/50">
              CE accreditation · certificates · state boards
            </p>
          </div>
          <div className="rounded-lg border border-pro/30 bg-navy p-5">
            <p className="font-mono text-[10px] uppercase tracking-[2px] text-pro-light">
              Product 02
            </p>
            <p className="mt-2 font-serif text-2xl font-bold">Dental Track</p>
            <p className="mt-1 text-xs text-white/50">
              50-state CE dashboard · Free + Pro
            </p>
          </div>
          <div className="rounded-lg border border-ver/30 bg-navy p-5">
            <p className="font-mono text-[10px] uppercase tracking-[2px] text-ver-light">
              Product 03
            </p>
            <p className="mt-2 font-serif text-2xl font-bold">Dental Audit</p>
            <p className="mt-1 text-xs text-white/50">
              Random sample audits for state boards
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-3">
          <button className="rounded-md bg-gold px-5 py-2.5 text-sm font-semibold text-navy transition hover:bg-gold-light">
            Primary action
          </button>
          <button className="rounded-md border border-white/20 bg-transparent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/5">
            Secondary
          </button>
          <span className="rounded-full bg-gold/15 px-3 py-1 font-mono text-[10px] uppercase tracking-[1.5px] text-gold-light">
            Status badge
          </span>
        </div>

        <div className="mt-12 rounded-lg bg-white p-6 text-text">
          <p className="font-mono text-[10px] uppercase tracking-[2px] text-text-muted">
            Light surface
          </p>
          <p className="mt-2 font-serif text-2xl font-semibold text-navy">
            Body content on a light card
          </p>
          <p className="mt-1 text-sm text-text-mid">
            Tests the inverse palette — navy text on white, gold accents, and
            the muted neutrals used throughout the customer-portal screens.
          </p>
        </div>
      </div>
    </main>
  );
}
