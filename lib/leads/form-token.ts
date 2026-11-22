import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/*
  Invisible timing check for the public marketing lead forms. The page renders
  a signed "issued at" timestamp into a hidden field; the action rejects a
  submission that arrives faster than a person could fill the form, that is
  more than a day old, or that carries no valid token at all (posted without
  loading the page). Same HMAC construction as cert-claim-token.ts, with a
  "leadform:" domain-separation prefix.

  The clock is injectable (nowMs) for deterministic tests.
*/

/** Faster than this, nobody typed a name, organization and email. */
export const LEAD_FORM_MIN_FILL_MS = 3_000;
export const LEAD_FORM_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type LeadFormTokenCheck = "ok" | "too_fast" | "expired" | "invalid";

function getSecret(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to a string of at least 32 characters in .env.local",
    );
  }
  return Buffer.from(secret, "utf8");
}

function sign(value: string): string {
  return createHmac("sha256", getSecret())
    .update(`leadform:${value}`)
    .digest("base64url");
}

export function signLeadFormToken(nowMs: number = Date.now()): string {
  const issuedAt = String(nowMs);
  return `${issuedAt}.${sign(issuedAt)}`;
}

export function checkLeadFormToken(
  token: FormDataEntryValue | null | undefined,
  nowMs: number = Date.now(),
): LeadFormTokenCheck {
  if (typeof token !== "string") return "invalid";
  const dot = token.indexOf(".");
  if (dot <= 0) return "invalid";
  const issuedAt = token.slice(0, dot);
  if (!/^\d{1,15}$/.test(issuedAt)) return "invalid";

  const sigBuf = Buffer.from(token.slice(dot + 1));
  const expectedBuf = Buffer.from(sign(issuedAt));
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return "invalid";
  }

  const elapsed = nowMs - Number(issuedAt);
  if (elapsed < LEAD_FORM_MIN_FILL_MS) return "too_fast";
  if (elapsed > LEAD_FORM_MAX_AGE_MS) return "expired";
  return "ok";
}

/*
  Keyed hash of the submitter's IP, stored on the lead for the database-backed
  rate limit. Keyed so the stored value can't be reversed by hashing the IPv4
  space, and so no raw IP sits in the table.
*/
export function hashLeadIp(ip: string): string {
  return createHmac("sha256", getSecret()).update(`leadip:${ip}`).digest("base64url");
}
