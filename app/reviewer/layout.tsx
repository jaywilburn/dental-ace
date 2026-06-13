import { redirect } from "next/navigation";
import { PortalShell } from "@/components/portal-shell";
import { navFor } from "@/lib/nav/portal-nav";
import { requireUser } from "@/lib/auth/session";
import { AccessPendingGate } from "@/components/access/access-pending-gate";
import { pendingKindsFor } from "@/lib/auth/access-requests";

export default async function ReviewerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const entitled = user.staffRole === "REVIEWER" || user.staffRole === "ADMIN";
  if (!entitled) {
    if ((await pendingKindsFor(user.id)).has("REVIEWER")) {
      return <AccessPendingGate area="the review queue" />;
    }
    redirect("/home");
  }

  return (
    <PortalShell
      nav={navFor("reviewer")}
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
