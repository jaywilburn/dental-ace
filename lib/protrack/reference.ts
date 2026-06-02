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

export function stateName(code: string): string {
  return US_STATES[code.trim().toUpperCase()] ?? code;
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
