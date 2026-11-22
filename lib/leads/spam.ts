import type { MarketingLeadInput } from "@/lib/leads/schema";

/*
  Content rules for the public marketing lead forms (Verify and VerifyIQ
  contact). Since July 2026 almost every Verify submission has been a pasted
  sales pitch (SEO, classified ads, "directory listing" lures, lead-gen
  resellers) that walks straight past the honeypot, because a person or a
  form-filling service types it in. These rules look at what was written.

  A flagged lead is still saved (is_spam = true, visible under Admin > Leads >
  Spam) but sends no email, and the sender sees the normal success page.
  Pure so it can be tested against the real submissions without a database.

  Agreed with Jay 2026-11-05: any link in the message counts as spam; a real
  board inquiry never needs one.
*/

export const SPAM_REASONS = [
  "honeypot",
  "form_timing",
  "duplicate",
  "link",
  "html",
  "name_is_organization",
  "blocked_domain",
  "pitch",
] as const;
export type SpamReason = (typeof SPAM_REASONS)[number];

/** Admin-facing label for each reason (Admin > Leads > Spam). */
export const SPAM_REASON_LABEL: Record<SpamReason, string> = {
  honeypot: "Hidden field filled",
  form_timing: "Sent too fast or without the form",
  duplicate: "Repeat submission",
  link: "Link in message",
  html: "HTML in message",
  name_is_organization: "Name same as organization",
  blocked_domain: "Known spam sender",
  pitch: "Sales pitch",
};

/*
  A scheme, "www.", or a domain followed by a path ("directoryinspector.com/x").
  A bare domain on its own ("dentalace.org") is not a link: a real inquiry may
  name a site in passing, and the pitch rules catch the spam that does.
*/
const LINK = /https?:\/\/|\bwww\.|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\/\S/i;
const HTML = /<\s*\/?\s*(?:a|div|p|br|span|img|b|strong|script|iframe)\b[^>]*>/i;

/** Sender domains seen sending repeat spam through the Verify form. */
const BLOCKED_DOMAINS = new Set([
  "ultraleadgeneration.com",
  "freeb2bdata.org",
  "rocketdigitaltech.com",
  // Typo-squatted freemail used by link spammers.
  "aool.com",
  "maiil.com",
]);

/*
  Pitch phrases from the spam actually received. Each is specific enough that
  a state board asking about Verify would not write it.
*/
const PITCH = [
  /\bseo\b/i,
  /\bbacklinks?\b/i,
  /\bclassified (?:ads?|sites?|submissions?)\b/i,
  /\bdirectoryinspector\b/i,
  /came in through your contact form/i,
  /\b(?:business|directory) listing\b/i,
  /\bguest posts?\b/i,
  /\blead generation\b/i,
  /\bsearch (?:engine|rankings?)\b/i,
  /\brank(?:ing)? (?:higher|on google|#?1)\b/i,
  /\bwebsite (?:traffic|redesign)\b/i,
  /\b(?:single women|dating|romance)\b/i,
  // A mail-merge greeting left unfilled. Multiline: the message is not the first field.
  /^\s*hi name\b/im,
  /\b(?:profile|listing) (?:for|on) dentalace\.org\b/i,
  // Cold outreach that names the site as an outsider would.
  /\b(?:visited|came across|looking over|looked at|found|question for)\s+(?:your (?:site|website) )?dentalace\.org\b/i,
  /\b(?:paid ads|outreach software|lead lists)\b/i,
  /\b(?:explainer|promotional|engaging) videos?\b/i,
];

/**
 * The first content rule a lead trips, or null when it looks genuine. The
 * order only decides which reason is recorded; any hit is spam.
 */
export function contentSpamReason(lead: MarketingLeadInput): SpamReason | null {
  const message = lead.message ?? "";
  const text = [lead.contactName, lead.title ?? "", lead.organization, message].join("\n");

  if (HTML.test(text)) return "html";
  if (LINK.test(text)) return "link";

  const domain = lead.email.split("@")[1] ?? "";
  if (BLOCKED_DOMAINS.has(domain)) return "blocked_domain";

  if (PITCH.some((re) => re.test(text))) return "pitch";

  if (lead.contactName.trim().toLowerCase() === lead.organization.trim().toLowerCase()) {
    return "name_is_organization";
  }
  return null;
}

/** Message text normalized for the repeat-submission check. */
function normalizeForDuplicate(message: string | null | undefined): string | null {
  const m = (message ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  // Short messages ("Interested", "Please call me") repeat innocently.
  return m.length >= 40 ? m : null;
}

/** A lead saved in the last day, as the repeat check needs it. */
export type RecentLead = { email: string; message: string | null };

/**
 * Every check the action runs, in one place: the honeypots, the form timing
 * token, the content rules, then a repeat of an email or a message already
 * received in the last day (spam rows included, so a burst of the same pitch
 * is caught from the second copy on).
 */
export function spamReasonFor(input: {
  lead: MarketingLeadInput;
  honeypotFilled: boolean;
  formTimingOk: boolean;
  recentLeads: RecentLead[];
}): SpamReason | null {
  if (input.honeypotFilled) return "honeypot";
  if (!input.formTimingOk) return "form_timing";

  const content = contentSpamReason(input.lead);
  if (content) return content;

  const message = normalizeForDuplicate(input.lead.message);
  const repeat = input.recentLeads.some(
    (r) =>
      r.email === input.lead.email ||
      (message !== null && normalizeForDuplicate(r.message) === message),
  );
  return repeat ? "duplicate" : null;
}
