import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/*
  HMAC-signed session cookie. Replaces the previous @supabase/ssr-based
  cookie roundtrip with one we fully control.

  Format:    <base64url(payload)>.<base64url(hmac-sha256(payload))>
  Payload:   { userId, exp } where exp is epoch seconds. Access (staff role +
             feature entitlements) is loaded fresh from the users row each request.
  Secret:    SESSION_SECRET env var (>= 32 chars).
  Lifetime:  7 days. Refresh on next sign-in.

  Why we own this:
  - Supabase Auth still validates the credentials at sign-in.
  - All DB access goes through Prisma (DATABASE_URL / postgres role), so
    auth.uid()-based RLS is not gating our queries. RLS stays in place as
    defense-in-depth for direct Supabase clients we don't currently use.
  - The previous @supabase/ssr server-side cookie roundtrip kept dropping
    the auth cookie between requests on Next 16 + Turbopack. This sidesteps
    that surface entirely.
*/

export const SESSION_COOKIE_NAME = "dental_ace_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type SessionPayload = {
  userId: string;
  exp: number;
};

function getSecret(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to a string of at least 32 characters in .env.local",
    );
  }
  return Buffer.from(secret, "utf8");
}

function b64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64UrlDecode(s: string): Buffer {
  const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function hmac(payload: string): string {
  return b64UrlEncode(createHmac("sha256", getSecret()).update(payload).digest());
}

export function signSession(payload: Pick<SessionPayload, "userId">): string {
  const full: SessionPayload = {
    userId: payload.userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const encoded = b64UrlEncode(Buffer.from(JSON.stringify(full), "utf8"));
  return `${encoded}.${hmac(encoded)}`;
}

export function verifySession(cookieValue: string): SessionPayload | null {
  const dot = cookieValue.indexOf(".");
  if (dot <= 0) return null;
  const encoded = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);

  const expected = hmac(encoded);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const payload = JSON.parse(b64UrlDecode(encoded).toString("utf8")) as SessionPayload;
    if (!payload.userId || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  path: "/",
  // Allow http in dev, require https in prod.
  secure: process.env.NODE_ENV === "production",
};
