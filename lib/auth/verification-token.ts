import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/*
  Stateless, HMAC-signed email-verification token. Same construction as the
  session cookie, but a separate purpose + a 24h lifetime. Stateless on purpose:
  email clients/link-scanners may pre-fetch the link, and verification is
  idempotent, so there is no single-use token to "consume" and accidentally burn.

  Format:  <base64url(payload)>.<base64url(hmac-sha256("verify:" + payload))>
  Payload: { userId, exp } (epoch seconds)
  Secret:  SESSION_SECRET (the domain-separating "verify:" prefix keeps these
           tokens from being usable as session cookies and vice versa).
*/

export const VERIFICATION_MAX_AGE_SECONDS = 60 * 60 * 24; // 24 hours

type VerificationPayload = { userId: string; exp: number };

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
  return b64UrlEncode(
    createHmac("sha256", getSecret()).update(`verify:${payload}`).digest(),
  );
}

export function signEmailVerificationToken(userId: string): string {
  const payload: VerificationPayload = {
    userId,
    exp: Math.floor(Date.now() / 1000) + VERIFICATION_MAX_AGE_SECONDS,
  };
  const encoded = b64UrlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${encoded}.${hmac(encoded)}`;
}

/** Returns the userId if the token is valid + unexpired, else null. */
export function verifyEmailVerificationToken(token: string): string | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = hmac(encoded);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const payload = JSON.parse(
      b64UrlDecode(encoded).toString("utf8"),
    ) as VerificationPayload;
    if (!payload.userId || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload.userId;
  } catch {
    return null;
  }
}
