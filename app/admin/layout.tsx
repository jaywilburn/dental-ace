import { redirect } from "next/navigation";
import { PortalShell } from "@/components/portal-shell";
import { navFor } from "@/lib/nav/portal-nav";
import { requireUser } from "@/lib/auth/session";
import { AccessPendingGate } from "@/components/access/access-pending-gate";
import { pendingKindsFor } from "@/lib/auth/access-requests";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const entitled = user.staffRole === "ADMIN";
  if (!entitled) {
    if ((await pendingKindsFor(user.id)).has("ADMIN")) {
      return <AccessPendingGate area="AADB admin" />;
    }
    redirect("/home");
  }

  return (
    <PortalShell
      nav={navFor("admin")}
      userInitials={initialsFromEmail(user.email)}
      userName={user.email}
      userRole="AADB Admin"
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
