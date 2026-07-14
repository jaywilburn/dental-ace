/*
  Pure normalization + cleaning for the legacy CE dataset (see
  scripts/migrate-legacy.ts). No DB access — every function here is unit-tested
  in normalize.test.ts. Canonical target strings are reused from the app so the
  migrated rows match natively-created ones:
    - jurisdiction codes  <- lib/protrack/reference.ts (US states + CA provinces)
    - deliveryMethod      <- DELIVERY_FORMATS
    - courseType          <- CATEGORIES

  Relative imports (not "@/") so the same module loads under both tsx (the
  importer) and vitest (the tests).
*/
import { JURISDICTIONS } from "../../lib/protrack/reference";
import { DELIVERY_FORMATS, CATEGORIES } from "../../lib/forms/application/schemas";

// The client dated the package 2026-06-12; used as the issued/approval fallback
// when a row has no usable submitted/completed date.
export const PACKAGE_DATE = "2026-06-12";

// Bad source dates corrected after import: course 78 ("2024 Dental Beauty
// Boss") arrived with an approved_at of 1900-01-14; the title dates it to 2024
// (assumption confirmed 2026-07-13). Keyed by course legacyId, value is the
// corrected ISO approval date. Applied wherever approvedAt is derived so
// extracts, loads, and backfills all converge on the same fix.
export const LEGACY_APPROVED_AT_OVERRIDES: Record<number, string> = {
  78: "2024-01-01",
};

/**
 * Course validity window: approvedAt + 3 years, the same rule live approvals
 * use (lib/reviewer/actions.ts). ISO YYYY-MM-DD in and out; the noon-UTC
 * anchor matches the importer's isoDate() convention.
 */
export function courseExpiresAtIso(approvedAtIso: string): string {
  const d = new Date(`${approvedAtIso}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 3);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Jurisdiction (state / province) full-name -> 2-char code
// ---------------------------------------------------------------------------

// Invert JURISDICTIONS (code -> name) into name -> code, lowercased.
const NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(JURISDICTIONS).map(([code, name]) => [name.toLowerCase(), code]),
);

// Spelling/format variants seen in the legacy data that the plain inversion
// misses. Everything else (Jamaica, "Bucharest, Romania", "N/A", "Out of USA",
// dirty values) is intentionally unmapped -> dropped and logged.
const STATE_ALIASES: Record<string, string> = {
  "northdakota": "ND",
  "westvirginia": "WV",
  "washington dc": "DC",
  "washington d.c.": "DC",
  "d.c.": "DC",
};

/** Full jurisdiction name -> 2-char code, or null if unmappable. */
export function stateNameToCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (!key || key === "n/a") return null;
  return NAME_TO_CODE[key] ?? STATE_ALIASES[key] ?? null;
}

/**
 * Build the cert's `licenseStates` (2-char codes). Merges the single
 * `primary_state` in first, then the `license_states` JSON array, deduped and
 * order-preserving. Unmappable entries are dropped. Returns { codes, dropped }
 * so the importer can log what was discarded.
 */
export function normalizeLicenseStates(
  licenseStatesJson: string | null | undefined,
  primaryState: string | null | undefined,
): { codes: string[]; dropped: string[] } {
  const names: string[] = [];
  if (primaryState) names.push(primaryState);
  if (licenseStatesJson) {
    try {
      const parsed = JSON.parse(licenseStatesJson);
      if (Array.isArray(parsed)) {
        for (const v of parsed) if (typeof v === "string") names.push(v);
      }
    } catch {
      // not JSON — ignore; primary_state alone still applies
    }
  }
  const codes: string[] = [];
  const dropped: string[] = [];
  for (const name of names) {
    const code = stateNameToCode(name);
    if (code) {
      if (!codes.includes(code)) codes.push(code);
    } else if (name.trim() && !dropped.includes(name.trim())) {
      dropped.push(name.trim());
    }
  }
  return { codes, dropped };
}

// ---------------------------------------------------------------------------
// occupation -> licenseType (the on-cert free string, matching the attendee UI)
// ---------------------------------------------------------------------------

// Every dentist specialty maps to the general dentist license value the
// attendee form writes ("DDS/DMD"). There is no orthodontist license value.
const DENTIST_OCCUPATIONS = new Set([
  "dentist",
  "orthodontist",
  "oral surgeon",
  "pedodontist",
  "prosthodontist",
  "endodontist",
  "periodontist",
]);

/** Legacy occupation -> cert license type string, or null (non-clinical/unknown). */
export function occupationToLicenseType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (DENTIST_OCCUPATIONS.has(key)) return "DDS/DMD";
  if (key === "dental hygienist") return "RDH";
  if (key === "dental assistant") return "DA";
  // Dental Therapist / Front Office / Office Manager / Business Manager / blank
  return null;
}

// ---------------------------------------------------------------------------
// subject_matter -> courseType (CATEGORIES) ; course_format -> deliveryMethod
// ---------------------------------------------------------------------------

const SCIENTIFIC: (typeof CATEGORIES)[number] = "Scientific";
const BUSINESS: (typeof CATEGORIES)[number] = "Business/Practice Management";

/** Legacy subject_matter -> canonical CATEGORIES value, or null (garbage). */
export function subjectToCourseType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (key.includes("scientific") || key.includes("clinical")) return SCIENTIFIC;
  if (
    key.includes("business") ||
    key.includes("management") ||
    key.includes("practice") ||
    key.includes("leadership")
  ) {
    return BUSINESS;
  }
  return null; // e.g. a stray email address
}

const LIVE_ONLINE: (typeof DELIVERY_FORMATS)[number] = "Live/Online";
const ON_DEMAND_VIDEO: (typeof DELIVERY_FORMATS)[number] = "On Demand Video";
const LIVE_IN_PERSON: (typeof DELIVERY_FORMATS)[number] = "Live/In Person";

/** Legacy course_format -> canonical DELIVERY_FORMATS value, or null (dirty). */
export function formatToDelivery(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (key.includes("online")) return LIVE_ONLINE;
  if (key.includes("demand")) return ON_DEMAND_VIDEO;
  if (key.includes("person")) return LIVE_IN_PERSON;
  return null; // e.g. "Orthodontist", "Endodontist"
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_YEAR = 2015;
const MAX_YEAR = 2026;

/** Return a clean ISO YYYY-MM-DD in the sane window, else null. */
export function sanitizeCompletionDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = ISO_DATE.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const year = Number(y);
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  // Reject impossible calendar dates (e.g. 2026-13-40).
  const dt = new Date(`${y}-${mo}-${d}T12:00:00Z`);
  if (Number.isNaN(dt.getTime()) || dt.getUTCMonth() + 1 !== Number(mo) || dt.getUTCDate() !== Number(d)) {
    return null;
  }
  return `${y}-${mo}-${d}`;
}

/**
 * Choose the cert's issuedAt: the legacy submitted_at timestamp if parseable,
 * else a sane completion date, else the package date. Always a valid Date.
 */
export function resolveIssuedAt(
  submittedAt: string | null | undefined,
  saneCompletionDate: string | null,
): Date {
  if (submittedAt) {
    const t = new Date(submittedAt.trim());
    if (!Number.isNaN(t.getTime())) return t;
  }
  if (saneCompletionDate) return new Date(`${saneCompletionDate}T12:00:00Z`);
  return new Date(`${PACKAGE_DATE}T12:00:00Z`);
}

// ---------------------------------------------------------------------------
// Test / internal row exclusion
// ---------------------------------------------------------------------------

// Internal operator domains. CE Exchange (ceexchange.io) operates the platform
// and John Stamper (johnstampermedia.com) runs its marketing; every submission
// from these is a staff test/internal record, never a real licensee. This is the
// primary exclusion rule and covers 32 of the 40 excluded rows, including 6 that
// the client's manual DELETE list missed (the same operator, Prudence Khupe,
// submitting from ce@/john@ceexchange.io aliases rather than ea@).
const INTERNAL_EMAIL_DOMAINS = ["ceexchange.io", "johnstampermedia.com"];

// The remaining test rows that are NOT on an internal domain, curated from the
// client's flagged DELETE list: provider-staff test submissions from storypath.us
// ("Stefan test", "PF Test") and two "Test Test" gmail rows. Kept as an explicit
// id list, not a name match, so real storypath.us attendees are never swept up.
export const NON_DOMAIN_TEST_CERT_IDS: ReadonlySet<number> = new Set([
  1831, 1841, 1866, 2752, 3791, 3801, 3809, 4521,
]);

/**
 * Decide whether a legacy cert row is a test/internal record to skip.
 * Domain-first: any internal operator domain is excluded; the small curated id
 * list covers the handful of test rows on non-internal domains.
 */
export function classifyCertExclusion(row: {
  id: number;
  attendeeName: string | null;
  attendeeEmail: string | null;
}): { excluded: boolean; byInternalDomain: boolean; byCuratedId: boolean; reason: string | null } {
  const email = (row.attendeeEmail ?? "").trim().toLowerCase();
  const domain = email.includes("@") ? email.slice(email.lastIndexOf("@") + 1) : "";
  const byInternalDomain = INTERNAL_EMAIL_DOMAINS.includes(domain);
  const byCuratedId = NON_DOMAIN_TEST_CERT_IDS.has(row.id);
  const excluded = byInternalDomain || byCuratedId;
  const reason = !excluded
    ? null
    : [byInternalDomain ? `internal:${domain}` : null, byCuratedId ? "test-row" : null]
        .filter(Boolean)
        .join("+");
  return { excluded, byInternalDomain, byCuratedId, reason };
}
