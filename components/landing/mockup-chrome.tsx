/*
  Shared "browser chrome" wrapper for the three product mockups. Renders the
  traffic-light dots + a URL pill. Children render inside the chrome's content
  area. Server component; no state.
*/
export function MockupChrome({
  url,
  children,
}: {
  url: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="img"
      aria-label={`Product UI mockup: ${url}`}
      className="overflow-hidden rounded-xl border border-white/[0.08] bg-navy"
    >
      <div className="flex items-center gap-1.5 border-b border-white/[0.06] bg-white/[0.04] px-4 py-2.5">
        <span aria-hidden className="size-2.5 rounded-full bg-[#FF5F57]" />
        <span aria-hidden className="size-2.5 rounded-full bg-[#FEBC2E]" />
        <span aria-hidden className="size-2.5 rounded-full bg-[#28C840]" />
        <span className="mx-2.5 flex-1 truncate rounded-md bg-white/[0.05] px-2.5 py-1 font-mono text-[10px] text-white/30">
          {url}
        </span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
