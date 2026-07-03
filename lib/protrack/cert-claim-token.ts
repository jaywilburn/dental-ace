import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/*
  Stateless, HMAC-signed certificate-claim token. Same construction as
  verification-token.ts / set-password-token.ts but with a "certclaim:"
  domain-separation prefix and a long (90-day) lifetime — a CE certificate is a
  durable thing and the recipient may file it weeks after the course.

  It is emitted into the certificate-issued email (sent to the attendee's
  self-reported attendeeEmail) and consumed by
  /api/protrack/claim-certificate. Possession of the link therefore proves the
  clicker controls that inbox, which is what authorizes attaching the cert to the
  ProTrack account that owns the email (the "email is proven before a cert is
  attached" gate — see lib/protrack/ace-sync.ts). The clock is injectable
  (nowSeconds) for deterministic tests.
*/

export const CERT_CLAIM_MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90 days

type Payload = { certId: string; exp: number };

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
  return b64UrlEncode(createHmac("sha256", getSecret()).update(`certclaim:${payload}`).digest());
}

export function signCertClaimToken(
  certId: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const payload: Payload = { certId, exp: nowSeconds + CERT_CLAIM_MAX_AGE_SECONDS };
  const encoded = b64UrlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${encoded}.${hmac(encoded)}`;
}

/** Returns the issued-certificate id if valid + unexpired, else null. */
export function verifyCertClaimToken(
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
    if (!payload.certId || !payload.exp) return null;
    if (payload.exp < nowSeconds) return null;
    return payload.certId;
  } catch {
    return null;
  }
}
