import { LicenseType, RequirementStatus } from "@prisma/client";
import type { RequirementCategory } from "@/lib/protrack/progress";

/*
  US state CE requirements — single source of truth.

  Consumed by both `pnpm seed` (prisma/seed.ts) and `pnpm import:requirements`
  (scripts/import-state-requirements.ts) so dev and prod/staging never drift.

  Source: https://www.aces4ce.com/state-ce-requirements/ (summary table:
  State | renewal period (years) | DDS units | RDH units | RDA units).

  ASSUMPTIONS (spot-checked against known values, e.g. FL DDS 30h/2yr,
  CA RDH 25h/2yr, NY DDS 60h/3yr, TX 24h/2yr):
    - 1 CE "unit" (as aces4ce labels it) = 1 hour. Stored directly in totalHours.
    - cycleMonths = renewal years * 12.
    - renewalMonth is null for every aces4ce row: the summary table carries no
      renewal-date column, and most boards are birthday/anniversary-based. The
      dashboard countdown uses the user's own UserLicense.renewalDate, so null is
      safe; set a fixed 1-12 month later only if a board confirms a statewide date.
    - An RDA value of 0 in the source means "no dental-assistant CE requirement
      listed", so we OMIT the DA row entirely (a missing requirement resolves to
      the existing "no requirements on file" path). Only the 13 states that list a
      real RDA number get a DA row.
    - Categories are empty for all aces4ce rows (totals-only tracking: overall
      progress bar, no per-category cards).

  EXCEPTIONS: TX/CA/FL RDH keep their hand-built category breakdowns and stay
  PROVISIONAL — they drive the Sarah Mitchell demo and the category-card UI, and
  those splits are mockups (not board-confirmed). See DEMO_RDH_REQUIREMENTS below.
*/

export type StateRequirementSeed = {
  state: string; // 2-letter code, must be in US_STATES
  licenseType: LicenseType; // DDS_DMD | RDH | DA
  totalHours: number;
  cycleMonths: number; // renewal years * 12
  renewalMonth: number | null; // null = birthday/rolling; 1-12 = fixed-date board
  categories: RequirementCategory[]; // [] = totals-only
  status: RequirementStatus;
  source: string;
};

const ACES4CE_SOURCE = "aces4ce.com";

// RDH for these states comes from DEMO_RDH_REQUIREMENTS, not the aces4ce table.
const DEMO_RDH_STATES = new Set(["TX", "CA", "FL"]);

/*
  aces4ce.com summary table, one line per jurisdiction (50 states + DC).
  `years` is the default renewal cycle; `rdhYears` overrides it for the lone
  split-cycle board (Washington: DDS triennial, RDH annual). rda 0 = omit DA row.
*/
type Aces4ceRow = {
  code: string;
  years: number;
  rdhYears?: number;
  dds: number;
  rdh: number;
  rda: number;
};

const ACES4CE_TABLE: Aces4ceRow[] = [
  { code: "AL", years: 1, dds: 20, rdh: 12, rda: 0 },
  { code: "AK", years: 2, dds: 32, rdh: 20, rda: 0 },
  { code: "AZ", years: 3, dds: 63, rdh: 45, rda: 0 },
  { code: "AR", years: 2, dds: 50, rdh: 40, rda: 0 },
  { code: "CA", years: 2, dds: 50, rdh: 25, rda: 25 },
  { code: "CO", years: 2, dds: 30, rdh: 30, rda: 0 },
  { code: "CT", years: 2, dds: 25, rdh: 16, rda: 0 },
  { code: "DE", years: 2, dds: 50, rdh: 24, rda: 0 },
  { code: "DC", years: 2, dds: 30, rdh: 15, rda: 10 },
  { code: "FL", years: 2, dds: 30, rdh: 24, rda: 0 },
  { code: "GA", years: 2, dds: 40, rdh: 22, rda: 0 },
  { code: "HI", years: 2, dds: 32, rdh: 20, rda: 0 },
  { code: "ID", years: 2, dds: 30, rdh: 30, rda: 0 },
  { code: "IL", years: 3, dds: 48, rdh: 36, rda: 0 },
  { code: "IN", years: 2, dds: 20, rdh: 19, rda: 0 },
  { code: "IA", years: 2, dds: 30, rdh: 30, rda: 20 },
  { code: "KS", years: 2, dds: 60, rdh: 30, rda: 0 },
  { code: "KY", years: 2, dds: 30, rdh: 30, rda: 0 },
  { code: "LA", years: 2, dds: 30, rdh: 20, rda: 0 },
  { code: "ME", years: 2, dds: 40, rdh: 30, rda: 0 },
  { code: "MD", years: 2, dds: 30, rdh: 30, rda: 0 },
  { code: "MA", years: 2, dds: 40, rdh: 20, rda: 12 },
  { code: "MI", years: 3, dds: 60, rdh: 36, rda: 36 },
  { code: "MN", years: 2, dds: 50, rdh: 25, rda: 25 },
  { code: "MS", years: 2, dds: 40, rdh: 20, rda: 0 },
  { code: "MO", years: 2, dds: 50, rdh: 30, rda: 0 },
  { code: "MT", years: 3, dds: 60, rdh: 36, rda: 0 },
  { code: "NE", years: 2, dds: 30, rdh: 30, rda: 0 },
  { code: "NV", years: 1, dds: 20, rdh: 15, rda: 0 },
  { code: "NH", years: 2, dds: 40, rdh: 20, rda: 0 },
  { code: "NJ", years: 2, dds: 40, rdh: 20, rda: 10 },
  { code: "NM", years: 3, dds: 60, rdh: 45, rda: 30 },
  { code: "NY", years: 3, dds: 60, rdh: 24, rda: 0 },
  { code: "NC", years: 1, dds: 15, rdh: 6, rda: 0 },
  { code: "ND", years: 2, dds: 32, rdh: 16, rda: 16 },
  { code: "OH", years: 2, dds: 40, rdh: 24, rda: 0 },
  { code: "OK", years: 2, dds: 40, rdh: 20, rda: 0 },
  { code: "OR", years: 2, dds: 40, rdh: 24, rda: 0 },
  { code: "PA", years: 2, dds: 30, rdh: 20, rda: 10 },
  { code: "RI", years: 2, dds: 40, rdh: 20, rda: 0 },
  { code: "SC", years: 2, dds: 28, rdh: 14, rda: 0 },
  { code: "SD", years: 5, dds: 100, rdh: 75, rda: 60 },
  { code: "TN", years: 2, dds: 40, rdh: 30, rda: 24 },
  { code: "TX", years: 2, dds: 24, rdh: 24, rda: 12 },
  { code: "UT", years: 2, dds: 30, rdh: 30, rda: 0 },
  { code: "VT", years: 2, dds: 30, rdh: 18, rda: 0 },
  { code: "VA", years: 1, dds: 15, rdh: 15, rda: 0 },
  { code: "WA", years: 3, rdhYears: 1, dds: 63, rdh: 15, rda: 0 },
  { code: "WV", years: 2, dds: 35, rdh: 20, rda: 0 },
  { code: "WI", years: 2, dds: 30, rdh: 12, rda: 0 },
  { code: "WY", years: 2, dds: 16, rdh: 16, rda: 0 },
];

function aces4ceRow(
  state: string,
  licenseType: LicenseType,
  totalHours: number,
  years: number,
): StateRequirementSeed {
  return {
    state,
    licenseType,
    totalHours,
    cycleMonths: years * 12,
    renewalMonth: null,
    categories: [],
    status: RequirementStatus.CONFIRMED,
    source: ACES4CE_SOURCE,
  };
}

function buildAces4ceRows(): StateRequirementSeed[] {
  const rows: StateRequirementSeed[] = [];
  for (const r of ACES4CE_TABLE) {
    rows.push(aces4ceRow(r.code, LicenseType.DDS_DMD, r.dds, r.years));
    if (!DEMO_RDH_STATES.has(r.code)) {
      rows.push(aces4ceRow(r.code, LicenseType.RDH, r.rdh, r.rdhYears ?? r.years));
    }
    if (r.rda > 0) {
      rows.push(aces4ceRow(r.code, LicenseType.DA, r.rda, r.years));
    }
  }
  return rows;
}

/*
  Demo/mockup RDH requirements with curated category breakdowns. PROVISIONAL on
  purpose: the category splits are illustrative, not board-confirmed, and the
  dashboard's "provisional" banner should still show for these. Drives the Sarah
  Mitchell (TX RDH) demo. Replace with John's authoritative file when it lands.
*/
const DEMO_RDH_REQUIREMENTS: StateRequirementSeed[] = [
  {
    state: "TX",
    licenseType: LicenseType.RDH,
    totalHours: 18,
    cycleMonths: 24,
    renewalMonth: 12,
    categories: [
      { name: "General CE", hours: 10, format: "ANY" },
      { name: "Jurisprudence", hours: 2, format: "ONLINE" },
      { name: "Sedation", hours: 2, format: "IN_PERSON" },
      { name: "Infection Control", hours: 2, format: "ANY" },
      { name: "Med. Emergencies", hours: 1, format: "IN_PERSON" },
    ],
    status: RequirementStatus.PROVISIONAL,
    source: "Provisional seed (mockup). Replace with John's authoritative file.",
  },
  {
    state: "CA",
    licenseType: LicenseType.RDH,
    totalHours: 25,
    cycleMonths: 24,
    renewalMonth: null,
    categories: [
      { name: "General CE", hours: 21, format: "ANY" },
      { name: "Infection Control", hours: 2, format: "ANY" },
      { name: "Basic Life Support", hours: 2, format: "IN_PERSON" },
    ],
    status: RequirementStatus.PROVISIONAL,
    source: "Provisional seed. Replace with John's authoritative file.",
  },
  {
    state: "FL",
    licenseType: LicenseType.RDH,
    totalHours: 24,
    cycleMonths: 24,
    renewalMonth: null,
    categories: [
      { name: "General CE", hours: 16, format: "ANY" },
      { name: "Medical Errors", hours: 2, format: "ANY" },
      { name: "Jurisprudence", hours: 2, format: "ONLINE" },
      { name: "HIV/AIDS", hours: 1, format: "ANY" },
      { name: "Domestic Violence", hours: 2, format: "ANY" },
      { name: "Infection Control", hours: 1, format: "ANY" },
    ],
    status: RequirementStatus.PROVISIONAL,
    source: "Provisional seed. Replace with John's authoritative file.",
  },
];

export const US_STATE_REQUIREMENTS: StateRequirementSeed[] = [
  ...buildAces4ceRows(),
  ...DEMO_RDH_REQUIREMENTS,
];
