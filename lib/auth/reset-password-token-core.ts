import { createHmac, timingSafeEqual } from "node:crypto";

/*
  Stateless, HMAC-signed password-reset token — the pure implementation, with NO
  "server-only" guard so the unit test can import it directly (mirrors the split
  used by set-password-token-core.ts). The app imports the server-only re-export
  in ./reset-password-token; route handlers verify tokens through that.

  Same construction as set-password-token-core.ts but with a "reset:" domain-
  separation prefix, so a reset link is NOT interchangeable with an admin invite
  ("setpw:") or an email-verification link ("verify:"). Default 1h lifetime — a
  password-reset link should be short-lived. The clock is injectable (nowSeconds)
  for deterministic tests.
*/

export const RESET_PASSWORD_MAX_AGE_SECONDS = 60 * 60; // 1 hour

type Payload = { userId: string; exp: number };

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
  return buf.toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64UrlDecode(s: string): Buffer {
  const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function hmac(payload: string): string {
  return b64UrlEncode(createHmac("sha256", getSecret()).update(`reset:${payload}`).digest());
}

/**
 * Sign a password-reset token. `ttlSeconds` defaults to the standard 1h window;
 * the payload stays a plain `{userId, exp}`, so the verifier needs no change.
 */
export function signResetPasswordToken(
  userId: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  ttlSeconds: number = RESET_PASSWORD_MAX_AGE_SECONDS,
): string {
  const payload: Payload = { userId, exp: nowSeconds + ttlSeconds };
  const encoded = b64UrlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${encoded}.${hmac(encoded)}`;
}

/** Returns the userId if valid + unexpired, else null. */
export function verifyResetPasswordToken(
  token: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string | null {
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
    const payload = JSON.parse(b64UrlDecode(encoded).toString("utf8")) as Payload;
    if (!payload.userId || !payload.exp) return null;
    if (payload.exp < nowSeconds) return null;
    return payload.userId;
  } catch {
    return null;
  }
}
