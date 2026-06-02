import { PortalShell } from "@/components/portal-shell";
import { navFor, otherProductLinks, BACK_TO_HOME } from "@/lib/nav/portal-nav";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { licenseTypeShort, stateName } from "@/lib/protrack/reference";

/*
  ProTrack area. Every signed-in account has ProTrack (Free baseline), so the
  guard is just requireUser(); Pro pages call requireProtrackPro() themselves.
  The (app) route group keeps this guard off the public /signup page.
*/
export default async function ProtrackAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  const primary = await prisma.userLicense.findFirst({
    where: { licenseeId: user.id, isPrimary: true },
    select: { state: true, licenseType: true, licenseNumber: true },
  });

  const fullName = user.firstName
    ? `${user.firstName} ${user.lastName ?? ""}`.trim()
    : user.email;
  const userName = primary
    ? `${fullName}, ${licenseTypeShort(primary.licenseType)}`
    : fullName;
  const planLabel = user.protrackTier === "PRO" ? "Pro plan" : "Free plan";
  const userRole = primary
    ? `${stateName(primary.state)} · ${planLabel}`
    : planLabel;

  return (
    <PortalShell
      nav={navFor("protrack")}
      product="pro"
      userInitials={initialsFromName(fullName)}
      userName={userName}
      userRole={userRole}
      switchLinks={otherProductLinks(user, "protrack")}
      homeHref={BACK_TO_HOME.href}
    >
      {children}
    </PortalShell>
  );
}

function initialsFromName(input: string): string {
  const parts = input
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}
