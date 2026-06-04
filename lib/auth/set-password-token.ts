import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/*
  Stateless, HMAC-signed set-password token. Same construction as
  verification-token.ts but with a "setpw:" domain-separation prefix and a 24h
  lifetime. Emitted when an admin provisions a staff account; consumed by
  /api/auth/set-password to let the staffer choose their own password. The
  clock is injectable (nowSeconds) for deterministic tests.
*/

export const SET_PASSWORD_MAX_AGE_SECONDS = 60 * 60 * 24; // 24 hours

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
  return b64UrlEncode(createHmac("sha256", getSecret()).update(`setpw:${payload}`).digest());
}

export function signSetPasswordToken(
  userId: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const payload: Payload = { userId, exp: nowSeconds + SET_PASSWORD_MAX_AGE_SECONDS };
  const encoded = b64UrlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${encoded}.${hmac(encoded)}`;
}

/** Returns the userId if valid + unexpired, else null. */
export function verifySetPasswordToken(
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
