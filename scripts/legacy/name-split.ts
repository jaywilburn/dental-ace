/*
  Split a single attendee name string into first / last for a provisioned
  account (scripts/provision-legacy-accounts.ts). Mirrors the "first token is the
  first name, the rest is the last name" convention used in lib/verify/lookup.ts.
  User.firstName / lastName are both nullable, so a single-token or empty name
  degrades gracefully.
*/
export function splitName(full: string | null | undefined): {
  firstName: string | null;
  lastName: string | null;
} {
  const tokens = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { firstName: null, lastName: null };
  if (tokens.length === 1) return { firstName: tokens[0]!, lastName: null };
  return { firstName: tokens[0]!, lastName: tokens.slice(1).join(" ") };
}
