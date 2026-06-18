import { LicenseType } from "@prisma/client";

/*
  ProTrack reference data shared across the dashboard, registration, the 50-state
  browser, and multi-state tracking. Pure data + label helpers, no DB access.
*/

export const US_STATES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

export const STATE_CODES = Object.keys(US_STATES);

/*
  Canadian provinces + territories (2-letter codes, no collisions with US state
  codes). Added June 2026 at the client's request so Canadian licensees and ACE
  certificate recipients can denote their jurisdiction. CE-hour requirements per
  province are not seeded yet (blocked on the authoritative requirements file),
  so provinces appear in dropdowns but show no requirement progress until loaded.
*/
export const CA_PROVINCES: Record<string, string> = {
  AB: "Alberta",
  BC: "British Columbia",
  MB: "Manitoba",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  NS: "Nova Scotia",
  NT: "Northwest Territories",
  NU: "Nunavut",
  ON: "Ontario",
  PE: "Prince Edward Island",
  QC: "Quebec",
  SK: "Saskatchewan",
  YT: "Yukon",
};

/*
  The full jurisdiction set (US states + Canadian provinces). Use this for
  membership validation and name lookup; the `state`/`license_states` DB columns
  are Char(2) strings, so province codes need no schema change.
*/
export const JURISDICTIONS: Record<string, string> = {
  ...US_STATES,
  ...CA_PROVINCES,
};

export const JURISDICTION_CODES = Object.keys(JURISDICTIONS);

/*
  Grouped, name-sorted options for rendering a <select> with <optgroup>s so
  provinces are clearly separated from US states rather than interleaved
  alphabetically. Shared by every jurisdiction dropdown.
*/
export const JURISDICTION_GROUPS: {
  label: string;
  options: { code: string; name: string }[];
}[] = [
  {
    label: "United States",
    options: Object.keys(US_STATES)
      .sort((a, b) => US_STATES[a]!.localeCompare(US_STATES[b]!))
      .map((code) => ({ code, name: US_STATES[code]! })),
  },
  {
    label: "Canada",
    options: Object.keys(CA_PROVINCES)
      .sort((a, b) => CA_PROVINCES[a]!.localeCompare(CA_PROVINCES[b]!))
      .map((code) => ({ code, name: CA_PROVINCES[code]! })),
  },
];

export function stateName(code: string): string {
  return JURISDICTIONS[code.trim().toUpperCase()] ?? code;
}

const LICENSE_SHORT: Record<LicenseType, string> = {
  DDS_DMD: "DDS",
  RDH: "RDH",
  DA: "DA",
};

const LICENSE_LONG: Record<LicenseType, string> = {
  DDS_DMD: "Dentist",
  RDH: "Dental Hygienist",
  DA: "Dental Assistant",
};

export function licenseTypeShort(type: LicenseType): string {
  return LICENSE_SHORT[type];
}

export function licenseTypeLong(type: LicenseType): string {
  return LICENSE_LONG[type];
}

export const LICENSE_TYPE_OPTIONS: { value: LicenseType; label: string }[] = [
  { value: LicenseType.RDH, label: "Dental Hygienist (RDH)" },
  { value: LicenseType.DDS_DMD, label: "Dentist (DDS / DMD)" },
  { value: LicenseType.DA, label: "Dental Assistant (DA)" },
];
