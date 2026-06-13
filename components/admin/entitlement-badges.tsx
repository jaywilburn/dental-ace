import { cn } from "@/lib/utils";

/*
  Compact pills summarising an account's entitlements ("visibility") for the
  admin users list and detail header. Product colours follow the brand tokens:
  DentalACE = gold (--ace), ProTrack = teal (--pro), Verify = blue (--ver).
  Staff role uses navy. Renders nothing for a plain unentitled FREE account
  beyond its ProTrack pill, so every row shows at least one badge.
*/

export type EntitlementShape = {
  staffRole: "NONE" | "REVIEWER" | "ADMIN";
  companyId: string | null;
  protrackTier: "FREE" | "PRO";
  verifyAccess: boolean;
};

function Pill({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none",
        className,
      )}
    >
      {label}
    </span>
  );
}

export function EntitlementBadges({ user }: { user: EntitlementShape }) {
  return (
    <div className="flex flex-wrap gap-1">
      {user.staffRole !== "NONE" ? (
        <Pill label={user.staffRole} className="bg-navy text-white" />
      ) : null}
      {user.companyId ? (
        <Pill label="DentalACE" className="bg-ace-bg text-ace-dark" />
      ) : null}
      <Pill
        label={user.protrackTier === "PRO" ? "ProTrack Pro" : "ProTrack Free"}
        className={
          user.protrackTier === "PRO"
            ? "bg-pro-bg text-pro-dark"
            : "bg-surface text-text-muted"
        }
      />
      {user.verifyAccess ? (
        <Pill label="Verify" className="bg-ver-bg text-ver-dark" />
      ) : null}
    </div>
  );
}
