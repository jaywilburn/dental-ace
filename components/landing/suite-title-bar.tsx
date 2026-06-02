/*
  Centered band that frames the three product detail sections below it.
  Navy background, no decorative effects, simple typographic hierarchy.
*/
export function SuiteTitleBar() {
  return (
    <div className="bg-navy px-5 py-14 text-center md:px-10">
      <p className="mb-4 font-mono text-[10px] uppercase tracking-[3px] text-white/55">
        AADB · An integrated platform
      </p>
      <p className="mb-3.5 text-balance font-serif text-[clamp(2rem,5vw,3.125rem)] font-bold leading-tight text-white">
        The DentalACE One Suite
      </p>
      <p className="mx-auto max-w-[480px] text-pretty text-base leading-relaxed text-white/60">
        Three connected tools. One platform. Built on AADB authority.
      </p>
    </div>
  );
}
