import { describe, expect, it } from "vitest";
import {
  classifyCertExclusion,
  formatToDelivery,
  normalizeLicenseStates,
  occupationToLicenseType,
  PACKAGE_DATE,
  resolveIssuedAt,
  sanitizeCompletionDate,
  stateNameToCode,
  subjectToCourseType,
} from "./normalize";

describe("stateNameToCode", () => {
  it("maps US state full names to 2-char codes", () => {
    expect(stateNameToCode("Texas")).toBe("TX");
    expect(stateNameToCode("South Carolina")).toBe("SC");
    expect(stateNameToCode("  california ")).toBe("CA"); // case + whitespace
  });
  it("maps Canadian provinces", () => {
    expect(stateNameToCode("Ontario")).toBe("ON");
    expect(stateNameToCode("Alberta")).toBe("AB");
  });
  it("applies known spelling/format aliases", () => {
    expect(stateNameToCode("NorthDakota")).toBe("ND");
    expect(stateNameToCode("WestVirginia")).toBe("WV");
    expect(stateNameToCode("Washington DC")).toBe("DC");
    expect(stateNameToCode("District of Columbia")).toBe("DC");
  });
  it("returns null for unmappable / blank / N/A", () => {
    expect(stateNameToCode("Jamaica")).toBeNull();
    expect(stateNameToCode("Bucharest, Romania")).toBeNull();
    expect(stateNameToCode("N/A")).toBeNull();
    expect(stateNameToCode("")).toBeNull();
    expect(stateNameToCode(null)).toBeNull();
  });
});

describe("normalizeLicenseStates", () => {
  it("merges primary state first and dedupes", () => {
    const r = normalizeLicenseStates('["Mississippi", "Montana"]', "Mississippi");
    expect(r.codes).toEqual(["MS", "MT"]);
    expect(r.dropped).toEqual([]);
  });
  it("keeps primary even if not in the array", () => {
    const r = normalizeLicenseStates('["Montana"]', "Texas");
    expect(r.codes).toEqual(["TX", "MT"]);
  });
  it("drops unmappable names and records them", () => {
    const r = normalizeLicenseStates('["Texas", "Jamaica"]', null);
    expect(r.codes).toEqual(["TX"]);
    expect(r.dropped).toEqual(["Jamaica"]);
  });
  it("returns empty codes when nothing maps", () => {
    const r = normalizeLicenseStates('["N/A"]', "N/A");
    expect(r.codes).toEqual([]);
    expect(r.dropped).toEqual(["N/A"]);
  });
  it("survives non-JSON license_states, keeping primary", () => {
    const r = normalizeLicenseStates("not json", "Ohio");
    expect(r.codes).toEqual(["OH"]);
  });
});

describe("occupationToLicenseType", () => {
  it("maps every dentist specialty to DDS/DMD", () => {
    for (const occ of ["Dentist", "Orthodontist", "Oral Surgeon", "Pedodontist", "Prosthodontist", "Endodontist", "Periodontist"]) {
      expect(occupationToLicenseType(occ)).toBe("DDS/DMD");
    }
  });
  it("maps hygienist and assistant", () => {
    expect(occupationToLicenseType("Dental Hygienist")).toBe("RDH");
    expect(occupationToLicenseType("Dental Assistant")).toBe("DA");
  });
  it("returns null for non-clinical / unknown / blank", () => {
    expect(occupationToLicenseType("Dental Therapist")).toBeNull();
    expect(occupationToLicenseType("Office Manager")).toBeNull();
    expect(occupationToLicenseType("Front Office")).toBeNull();
    expect(occupationToLicenseType("")).toBeNull();
    expect(occupationToLicenseType(null)).toBeNull();
  });
});

describe("subjectToCourseType", () => {
  it("maps scientific/clinical variants to Scientific", () => {
    expect(subjectToCourseType("Clinical/Medical Scientific")).toBe("Scientific");
    expect(subjectToCourseType("Scientific (Clinical)")).toBe("Scientific");
  });
  it("maps business/management/leadership to Business/Practice Management", () => {
    expect(subjectToCourseType("Business/Practice Management")).toBe("Business/Practice Management");
    expect(subjectToCourseType("Business Management")).toBe("Business/Practice Management");
    expect(subjectToCourseType("Leadership")).toBe("Business/Practice Management");
  });
  it("returns null for garbage", () => {
    expect(subjectToCourseType("damelfdeducentre@gmail.com")).toBeNull();
    expect(subjectToCourseType(null)).toBeNull();
  });
});

describe("formatToDelivery", () => {
  it("maps the two real formats", () => {
    expect(formatToDelivery("Live Online")).toBe("Live/Online");
    expect(formatToDelivery("On-Demand")).toBe("On Demand Video");
  });
  it("returns null for dirty values", () => {
    expect(formatToDelivery("Orthodontist")).toBeNull();
    expect(formatToDelivery("Endodontist")).toBeNull();
    expect(formatToDelivery("")).toBeNull();
  });
});

describe("sanitizeCompletionDate", () => {
  it("keeps ISO dates inside the sane window", () => {
    expect(sanitizeCompletionDate("2026-05-20")).toBe("2026-05-20");
    expect(sanitizeCompletionDate("2015-01-01")).toBe("2015-01-01");
  });
  it("nulls impossible / out-of-window / malformed dates", () => {
    expect(sanitizeCompletionDate("2002-12-12")).toBeNull(); // pre-window
    expect(sanitizeCompletionDate("2925-09-12")).toBeNull(); // future
    expect(sanitizeCompletionDate("1074-10-25")).toBeNull(); // ancient
    expect(sanitizeCompletionDate("2026-13-40")).toBeNull(); // impossible
    expect(sanitizeCompletionDate("4/1/1661")).toBeNull(); // non-ISO
    expect(sanitizeCompletionDate("")).toBeNull();
  });
});

describe("resolveIssuedAt", () => {
  it("uses submitted_at when parseable", () => {
    const d = resolveIssuedAt("2026-05-20T17:10:11", null);
    expect(d.toISOString().startsWith("2026-05-20")).toBe(true);
  });
  it("falls back to the sane completion date", () => {
    const d = resolveIssuedAt(null, "2025-03-04");
    expect(d.toISOString().startsWith("2025-03-04")).toBe(true);
  });
  it("falls back to the package date when nothing usable", () => {
    const d = resolveIssuedAt(null, null);
    expect(d.toISOString().startsWith(PACKAGE_DATE)).toBe(true);
  });
});

describe("classifyCertExclusion", () => {
  it("excludes any internal operator domain", () => {
    const ce = classifyCertExclusion({ id: 999999, attendeeName: "Prudence Khupe", attendeeEmail: "ce@ceexchange.io" });
    expect(ce.excluded).toBe(true);
    expect(ce.byInternalDomain).toBe(true);
    expect(ce.reason).toContain("internal:ceexchange.io");
    expect(classifyCertExclusion({ id: 888888, attendeeName: "John Stamper", attendeeEmail: "john@johnstampermedia.com" }).excluded).toBe(true);
  });
  it("excludes a curated non-domain test row by id", () => {
    const r = classifyCertExclusion({ id: 1831, attendeeName: "Stefan test", attendeeEmail: "stefanb@storypath.us" });
    expect(r.excluded).toBe(true);
    expect(r.byCuratedId).toBe(true);
    expect(r.reason).toContain("test-row");
  });
  it("keeps normal rows, including real storypath.us attendees not on the curated list", () => {
    const normal = classifyCertExclusion({ id: 12345, attendeeName: "Krystal Youmans", attendeeEmail: "k@fdhonline.com" });
    expect(normal.excluded).toBe(false);
    expect(normal.reason).toBeNull();
    // a storypath.us row NOT in the curated id list is a real attendee -> kept
    expect(classifyCertExclusion({ id: 77777, attendeeName: "Real Attendee", attendeeEmail: "someone@storypath.us" }).excluded).toBe(false);
  });
});
