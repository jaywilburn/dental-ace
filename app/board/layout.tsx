import { PortalShell } from "@/components/portal-shell";
import { navFor, otherProductLinks, BACK_TO_HOME } from "@/lib/nav/portal-nav";
import { requireBoard } from "@/lib/board/scope";
import { stateName } from "@/lib/protrack/reference";

/*
  Verify (state-board) portal. Guarded by requireBoard() which enforces
  verify_access + a populated board_id. The URL segment is /board to match the
  role-named convention of the other portals (/admin, /reviewer, /company); the
  product name in the brand mark is "Verify" (product="ver").
*/
export default async function BoardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, board } = await requireBoard();

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
