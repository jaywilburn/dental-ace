import { MockupChrome } from "@/components/landing/mockup-chrome";

/*
  Verify state-board mockup. Texas State Board header with licensee count, a
  4-stat row (compliant / in progress / deficient / compliant %), segmented
  compliance bar, "Run Random Audit" button, and an active audit batch card.
*/

const audit = [
  { label: "Compliant", value: "5,241", color: "text-emerald-300" },
  { label: "In progress", value: "2,637", color: "text-ace-light" },
  { label: "Deficient", value: "534", color: "text-red-300" },
  { label: "Compliant %", value: "62%", color: "text-white" },
];

export function MockupVerify() {
  return (
    <MockupChrome url="dentalace.org/verify/dashboard">
      <p className="mb-2 text-[11px] text-white/30 tabular-nums">
        Texas State Board · 8,412 active licensees
      </p>

      <div className="mb-2.5 grid grid-cols-4 gap-1.5">
        {audit.map((stat) => (
          <div
            key={stat.label}
            className="rounded-md bg-white/[0.04] p-2 text-center"
          >
            <p
              className={`font-serif text-lg font-bold leading-none tabular-nums ${stat.color}`}
            >
              {stat.value}
            </p>
            <p className="mt-0.5 text-[9px] text-white/30">{stat.label}</p>
          </div>
        ))}
      </div>

      <div
        role="img"
        aria-label="Compliance breakdown: 62% compliant, 31% in progress, 7% deficient"
        className="mb-2.5 flex h-3.5 overflow-hidden rounded-full bg-white/[0.05]"
      >
        <span className="bg-emerald-600" style={{ width: "62%" }} />
        <span className="bg-amber-600" style={{ width: "31%" }} />
        <span className="bg-red-600" style={{ width: "7%" }} />
      </div>

      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        className="mb-2 w-full rounded-md bg-ace py-2.5 text-xs font-bold text-navy"
      >
        🎲 Run Random Audit · 10% of licensees
      </button>

      <div className="rounded-md border border-ver/25 bg-ver/10 px-3 py-2">
        <p className="mb-0.5 text-[11px] font-semibold text-ver-light">
          Active audit · TX-2025-003
        </p>
        <p className="text-[11px] text-white/35 tabular-nums">
          841 licensees selected · 34 deficiencies found
        </p>
      </div>
    </MockupChrome>
  );
}
