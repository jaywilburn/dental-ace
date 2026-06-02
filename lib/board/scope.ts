import "server-only";
import { redirect } from "next/navigation";
import { requireUser, type SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import type { Board } from "@prisma/client";

/*
  Board portal scoping helper.

  Every /board/* server component and server action calls this to:
   1. require a signed-in user;
   2. require the verifyAccess entitlement (or ADMIN);
   3. resolve the user's `boards` row.

  A signed-in user with verifyAccess but no boardId is bounced to /signup/board
  — that's the "your account has access, finish picking your board" path. ADMIN
  with no boardId is allowed through (acting on behalf of any board) and a null
  board is returned; callers that need a board should check it explicitly.
*/
export type BoardContext = {
  user: SessionUser;
  board: Board;
};

export async function requireBoard(): Promise<BoardContext> {
  const user = await requireUser();
  if (!user.verifyAccess && user.staffRole !== "ADMIN") redirect("/home");
  if (!user.boardId) redirect("/signup/board");

  const board = await prisma.board.findUnique({ where: { id: user.boardId } });
  if (!board) redirect("/signup/board");

  return { user, board };
}
