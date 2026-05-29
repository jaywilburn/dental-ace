/*
  Trust section: 3 cards on white explaining what makes the platform
  defensible (AADB authority, connected design, regulatory alignment).
  Cards sit on --surface inside a white page section.
*/

const cards = [
  {
    icon: "🏛",
    title: "AADB accreditation authority",
    body: "Dental ACE is the official AADB accreditation program. That credential carries weight with state boards and attendees nationwide; no startup can replicate it.",
  },
  {
    icon: "🔗",
    title: "Connected by design",
    body: "Dental ACE, ProTrack, and Verify share one data layer. A Dental ACE certificate auto-appears in ProTrack. Verify reads compliance live from ProTrack. No duplicate entry anywhere.",
  },
  {
    icon: "📋",
    title: "Regulatory alignment",
    body: "Verify is an AADB program, not a third-party vendor tool. That distinction is what makes state boards willing to adopt it as part of their official compliance process.",
  },
];

export function TrustSection() {
  return (
    <section id="about" className="bg-white px-5 py-16 text-center md:px-10 md:py-20">
      <p className="mb-2.5 font-mono text-[10px] uppercase tracking-[2.5px] text-text-muted">
        Why the Dental ACE platform
      </p>
      <h2 className="mb-2 text-balance font-serif text-3xl font-bold text-navy md:text-[38px]">
        Built on institutional authority
      </h2>
      <p className="mx-auto mb-12 max-w-[520px] text-pretty text-[15px] leading-relaxed text-text-muted md:mb-14">
        The AADB sits at the intersection of CE providers, dental professionals,
        and state boards; no other organization does.
      </p>

      <div className="mx-auto grid max-w-[900px] gap-6 md:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.title}
            className="rounded-xl bg-surface p-6 text-left"
          >
            <p aria-hidden className="mb-3 text-3xl">
              {card.icon}
            </p>
            <p className="mb-1.5 text-[15px] font-semibold text-navy">
              {card.title}
            </p>
            <p className="text-pretty text-[13px] leading-relaxed text-text-muted">
              {card.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
