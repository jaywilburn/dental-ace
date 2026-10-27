/*
  Attendee email typo guard. An attendee who types "jane@gmail.con" gets a
  certificate emailed into the void and never finds it in ProTrack, so both
  public attendee forms catch the common slips.

  Two tiers, deliberately different in strength:
  - INVALID_TLD_FIXES: top-level domains that do not exist ("con", "cmo").
    An address ending in one can never receive mail, so the server REJECTS it
    (see invalidTldMessage, used by the attendee schemas and sign-up).
  - DOMAIN_TYPO_FIXES: likely misspellings of big mail providers ("gmial.com").
    These are only SUGGESTED on the client; the domain could be real, so the
    server never rejects them.

  Real two-letter country codes that look like typos (.cm Cameroon, .co
  Colombia) are intentionally absent: they are valid destinations.

  Pure and framework-free so the client form bundle can import it.
*/

/** Non-existent TLD typo -> the TLD the attendee almost certainly meant. */
export const INVALID_TLD_FIXES: Readonly<Record<string, string>> = {
  con: "com",
  cmo: "com",
  ocm: "com",
  comm: "com",
  nte: "net",
  ogr: "org",
};

/** Common provider-domain misspelling -> the provider's real domain. */
export const DOMAIN_TYPO_FIXES: Readonly<Record<string, string>> = {
  "gmial.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gamil.com": "gmail.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "hotmial.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "iclod.com": "icloud.com",
  "icoud.com": "icloud.com",
  "outlok.com": "outlook.com",
};

// Own-key lookup (never matches inherited keys like "constructor"). Not
// Object.hasOwn: older mobile Safari on attendee phones lacks it.
function has(map: Readonly<Record<string, string>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, key);
}

/** Splits on the LAST "@" (a quoted local part may contain one); null when
 *  there is no usable local part or domain. Domain is lowercased. */
function splitEmail(email: string): { local: string; domain: string } | null {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;
  return { local: trimmed.slice(0, at), domain: trimmed.slice(at + 1).toLowerCase() };
}

function tldOf(domain: string): string | null {
  const dot = domain.lastIndexOf(".");
  if (dot <= 0 || dot === domain.length - 1) return null;
  return domain.slice(dot + 1);
}

/** True when the address ends in a TLD from INVALID_TLD_FIXES (case and
 *  surrounding whitespace ignored). */
export function hasInvalidTld(email: string): boolean {
  const parts = splitEmail(email);
  if (!parts) return false;
  const tld = tldOf(parts.domain);
  return tld !== null && has(INVALID_TLD_FIXES, tld);
}

/**
 * The corrected full address, or null when nothing looks wrong. Fixes the TLD
 * first, then a provider misspelling, so "jane@gmial.con" becomes
 * "jane@gmail.com". The local part is kept exactly as typed (trimmed); the
 * domain is lowercased.
 */
export function suggestEmailFix(email: string): string | null {
  const parts = splitEmail(email);
  if (!parts) return null;
  let domain = parts.domain;

  const tld = tldOf(domain);
  if (tld !== null && has(INVALID_TLD_FIXES, tld)) {
    domain = `${domain.slice(0, domain.length - tld.length)}${INVALID_TLD_FIXES[tld]}`;
  }
  if (has(DOMAIN_TYPO_FIXES, domain)) {
    domain = DOMAIN_TYPO_FIXES[domain];
  }

  return domain === parts.domain ? null : `${parts.local}@${domain}`;
}

/** Server-side rejection message for an invalid-TLD address, or null when the
 *  TLD is fine. Domain misspellings alone return null (they could be real). */
export function invalidTldMessage(email: string): string | null {
  if (!hasInvalidTld(email)) return null;
  const suggestion = suggestEmailFix(email);
  return suggestion
    ? `Check your email address. Did you mean ${suggestion}?`
    : "Check your email address.";
}

/** Replaces anything email-shaped with "[email]" so a validation message that
 *  carries a suggested address can be logged without the attendee's address. */
export function redactEmails(text: string): string {
  return text.replace(/[^\s"'<>]+@[^\s"'<>?]+/g, "[email]");
}
