import { PortalShell } from "@/components/portal-shell";
import { navFor, otherProductLinks, BACK_TO_HOME } from "@/lib/nav/portal-nav";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export default async function CompanyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireDentalAce();

  const company = user.companyId
    ? await prisma.company.findUnique({
        where: { id: user.companyId },
        select: { name: true },
      })
    : null;

  return (
    <PortalShell
      nav={navFor("company")}
      userInitials={initialsFromName(company?.name ?? user.email)}
      userName={company?.name ?? user.email}
      userRole="CE Provider"
      switchLinks={otherProductLinks(user, "dentalace")}
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
