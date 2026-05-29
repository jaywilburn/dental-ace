"use server";

/*
  Auth server actions.

  Sign-in is a route handler at /api/auth/signin (see app/api/auth/signin/route.ts).
  Sign-out is a route handler at /api/auth/signout. Route handlers give us
  explicit cookie control on the redirect response — server actions were
  intermittently dropping Set-Cookie on Next 16 + Turbopack.

  No server actions live here today. The file remains so the import path
  doesn't break if anything still references it.
*/
