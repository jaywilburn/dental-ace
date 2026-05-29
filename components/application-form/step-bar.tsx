import { cn } from "@/lib/utils";

/*
  5-step progress bar shown across the top of each application-form step.
  Pure presentational; the current/done state is driven by props.
*/

export type StepStatus = "done" | "active" | "todo";

const stepLabels = [
  "Course Info",
  "Creator",
  "Presenters",
  "Quiz Builder",
  "Review",
];

export function ApplicationStepBar({ currentStep }: { currentStep: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <ol className="mb-6 flex items-center gap-2 overflow-x-auto">
      {stepLabels.map((label, i) => {
        const index = (i + 1) as 1 | 2 | 3 | 4 | 5;
        const status: StepStatus =
          index < currentStep ? "done" : index === currentStep ? "active" : "todo";
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums",
                status === "done" && "border-emerald-600 bg-emerald-600 text-white",
                status === "active" && "border-ace bg-ace text-navy",
                status === "todo" && "border-border bg-white text-text-muted",
              )}
            >
              {status === "done" ? "✓" : index}
            </span>
            <span
              className={cn(
                "text-[12px]",
                status === "active" && "font-semibold text-navy",
                status === "todo" && "text-text-muted",
                status === "done" && "text-text-mid",
              )}
            >
              {label}
            </span>
            {i < stepLabels.length - 1 ? (
              <span aria-hidden className="text-text-muted">
                ›
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
