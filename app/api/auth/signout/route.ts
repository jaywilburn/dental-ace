import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from "@/lib/auth/session-cookie";

/*
  POST /api/auth/signout
  Clears the session cookie + redirects to /login. Route handler instead of
  a server action so cookie deletion lands on the response reliably.
*/

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(`${request.nextUrl.origin}/login`, 303);
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    maxAge: 0,
    ...SESSION_COOKIE_OPTIONS,
  });
  return response;
}
