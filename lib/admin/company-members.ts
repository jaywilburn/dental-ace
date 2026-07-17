/*
  Pure display rules for the "Members" card on the admin company detail page
  (the accounts whose users.company_id points at the company).

  Display-only by design: there is no primary-POC column on the schema. The
  earliest-created linked account is labelled "Point of contact" by convention,
  matching how the reviewer/cron flows treat the first-linked user. Do not turn
  this into a schema field without revisiting those derivations.
*/

export type CompanyMemberDisplay = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  createdAt: Date;
};

/** Full name when we have any of it, otherwise the email (never an empty label). */
export function memberDisplayName(
  member: Pick<CompanyMemberDisplay, "email" | "firstName" | "lastName">,
): string {
  return [member.firstName, member.lastName].filter(Boolean).join(" ") || member.email;
}

/**
 * The earliest-created linked account gets the "Point of contact" label.
 * Ties keep the first member in list order (the page queries createdAt asc,
 * so this matches the query's stable ordering). Null when there are no members.
 */
export function pointOfContactId(
  members: readonly Pick<CompanyMemberDisplay, "id" | "createdAt">[],
): string | null {
  let earliest: Pick<CompanyMemberDisplay, "id" | "createdAt"> | null = null;
  for (const member of members) {
    if (!earliest || member.createdAt < earliest.createdAt) earliest = member;
  }
  return earliest?.id ?? null;
}
