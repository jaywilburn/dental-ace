import { redirect } from "next/navigation";
import { PortalShell } from "@/components/portal-shell";
import { navFor, otherProductLinks, BACK_TO_HOME } from "@/lib/nav/portal-nav";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { stateName } from "@/lib/protrack/reference";
import { AccessPendingGate } from "@/components/access/access-pending-gate";
import { pendingKindsFor } from "@/lib/auth/access-requests";

/*
  Verify (state-board) portal. Guarded by verifyAccess or ADMIN staff role.
  The URL segment is /board to match the role-named convention of the other
  portals (/admin, /reviewer, /company); the product name in the brand mark
  is "Verify" (product="ver").
*/
export default async function BoardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const entitled = user.verifyAccess || user.staffRole === "ADMIN";
  if (!entitled) {
    if ((await pendingKindsFor(user.id)).has("BOARD")) {
      return <AccessPendingGate area="Verify" />;
    }
    redirect("/home");
  }
  if (!user.boardId) redirect("/signup/board");

  const board = await prisma.board.findUnique({ where: { id: user.boardId } });
  if (!board) redirect("/signup/board");

  const fullName = user.firstName
    ? `${user.firstName} ${user.lastName ?? ""}`.trim()
    : user.email;

  return (
    <PortalShell
      nav={navFor("board")}
      product="ver"
      userInitials={initialsFromName(fullName)}
      userName={fullName}
      userRole={`${stateName(board.state)} Board`}
      switchLinks={otherProductLinks(user, "verify")}
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
