import { PortalShell } from "@/components/portal-shell";
import { navFor } from "@/lib/nav/portal-nav";
import { requireRole } from "@/lib/auth/session";

export default async function ReviewerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("REVIEWER");

  return (
    <PortalShell
      nav={navFor("REVIEWER")}
      activeHref="/reviewer"
      userInitials={initialsFromEmail(user.email)}
      userName={user.email}
      userRole="AADB Reviewer"
    >
      {children}
    </PortalShell>
  );
}

function initialsFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}
