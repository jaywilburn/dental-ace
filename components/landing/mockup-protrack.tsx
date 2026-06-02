import { MockupChrome } from "@/components/landing/mockup-chrome";

/*
  ProTrack licensee mockup. Texas dental hygienist requirement card with
  progress bar + remainder, three category cards (general / sedation /
  infection control), and an auto-sync notification at the bottom.
*/
export function MockupProTrack() {
  return (
    <MockupChrome url="dentalace.org/protrack/dashboard">
      <div className="mb-2.5 rounded-md bg-pro/15 p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold text-white">
              Texas · Dental Hygienist
            </p>
            <p className="text-[11px] text-white/40">
              2024–2026 · Renews Dec 31, 2026
            </p>
          </div>
          <p className="font-serif text-[22px] font-bold leading-none text-pro-light tabular-nums">
            12
            <span className="font-sans text-[13px] text-white/30">/18 hrs</span>
          </p>
        </div>
        <div className="mb-1.5 mt-2.5 flex justify-between text-[11px] text-white/35 tabular-nums">
          <span>12 of 18 hours (67%)</span>
          <span>6 hrs remaining</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-md bg-white/[0.08]">
          <div
            className="h-full rounded-md bg-gradient-to-r from-pro to-pro-light"
            style={{ width: "67%" }}
          />
        </div>
      </div>

      <div className="mb-2.5 grid grid-cols-3 gap-1.5">
        <div className="rounded-md bg-white/[0.04] p-2 text-center">
          <p className="mb-1 text-[10px] text-white/40">General CE</p>
          <p className="text-xs font-semibold text-emerald-300 tabular-nums">
            ✓ 10/10
          </p>
        </div>
        <div className="rounded-md bg-white/[0.04] p-2 text-center">
          <p className="mb-1 text-[10px] text-white/40">Sedation</p>
          <p className="text-xs font-semibold text-ace-light tabular-nums">
            ⚠ 1/2
          </p>
        </div>
        <div className="rounded-md bg-white/[0.04] p-2 text-center">
          <p className="mb-1 text-[10px] text-white/40">Infection</p>
          <p className="text-xs font-semibold text-red-300 tabular-nums">
            ✗ 0/2
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-md border border-pro/20 bg-pro/10 px-3 py-2">
        <span aria-hidden>⭐</span>
        <p className="text-[11px] text-pro-light">
          New DentalACE cert auto-added · Modern Periodontal Techniques · 3.0
          hrs
        </p>
      </div>
    </MockupChrome>
  );
}
