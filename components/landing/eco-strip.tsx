import { cn } from "@/lib/utils";

/*
  Ecosystem flow strip rendered at the base of the hero. Pills represent each
  product + the data hand-off step between them. Sits on navy with a 1px top
  divider.
*/

const node = (variant: "ace" | "pro" | "ver" | "step", label: string, key: string) => {
  const styles: Record<typeof variant, string> = {
    ace: "bg-ace/15 text-ace-light",
    pro: "bg-pro/15 text-pro-light",
    ver: "bg-ver/15 text-ver-light",
    step: "bg-white/[0.06] text-white/45",
  };
  return (
    <span
      key={key}
      className={cn(
        "whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold",
        styles[variant],
      )}
    >
      {label}
    </span>
  );
};

const arrow = (key: string) => (
  <span key={key} aria-hidden className="text-sm text-white/20">
    →
  </span>
);

export function EcoStrip() {
  return (
    <div className="relative z-10 mt-8 flex flex-wrap items-center justify-center gap-2 border-t border-white/[0.06] bg-navy px-5 py-7 md:px-10">
      {node("ace", "Dental ACE", "ace")}
      {arrow("a1")}
      {node("step", "Course approved · QR issued", "s1")}
      {arrow("a2")}
      {node("pro", "ProTrack", "pro")}
      {arrow("a3")}
      {node("step", "CE auto-logged to dashboard", "s2")}
      {arrow("a4")}
      {node("ver", "Verify", "ver")}
      {arrow("a5")}
      {node("step", "Board sees compliance instantly", "s3")}
    </div>
  );
}
