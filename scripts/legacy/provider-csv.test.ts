import { describe, expect, it } from "vitest";
import {
  companyNamesMatch,
  isValidProviderEmail,
  parseProvidersCsv,
} from "./provider-csv";

const HEADER = "legacy_id,company_name,owner_email,owner_first,owner_last";

describe("parseProvidersCsv", () => {
  it("parses well-formed rows and skips the header", () => {
    const { rows, skipped } = parseProvidersCsv(
      `${HEADER}\n7,Acme Dental,owner@acme.com,Jane,Doe\n8,Bright Smiles,admin@bright.org,Sam,Lee`,
    );
    expect(skipped).toEqual([]);
    expect(rows).toEqual([
      { legacyId: 7, companyName: "Acme Dental", ownerEmail: "owner@acme.com", ownerFirst: "Jane", ownerLast: "Doe", lineNo: 2 },
      { legacyId: 8, companyName: "Bright Smiles", ownerEmail: "admin@bright.org", ownerFirst: "Sam", ownerLast: "Lee", lineNo: 3 },
    ]);
  });

  it("keeps quoted fields containing commas intact", () => {
    const { rows } = parseProvidersCsv(`${HEADER}\n42,"Pearl, Inc.",owner@pearl.com,Mary Jo,Van Buren`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      legacyId: 42,
      companyName: "Pearl, Inc.",
      ownerEmail: "owner@pearl.com",
      ownerFirst: "Mary Jo",
      ownerLast: "Van Buren",
    });
  });

  it("unescapes doubled quotes inside a quoted field", () => {
    const { rows } = parseProvidersCsv(`${HEADER}\n9,"The ""Big"" Practice",o@x.com,A,B`);
    expect(rows[0]!.companyName).toBe('The "Big" Practice');
  });

  it("trims surrounding whitespace on every cell", () => {
    const { rows } = parseProvidersCsv(`${HEADER}\n  10 ,  Cove Dental ,  owner@cove.com  ,  Pat , Quinn `);
    expect(rows[0]).toMatchObject({
      legacyId: 10,
      companyName: "Cove Dental",
      ownerEmail: "owner@cove.com",
      ownerFirst: "Pat",
      ownerLast: "Quinn",
    });
  });

  it("skips blank owner_email rows", () => {
    const { rows, skipped } = parseProvidersCsv(`${HEADER}\n11,No Email Co,,First,Last`);
    expect(rows).toEqual([]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ lineNo: 2, reason: "blank owner_email" });
  });

  it("skips invalid owner_email rows", () => {
    const { rows, skipped } = parseProvidersCsv(`${HEADER}\n12,Bad Email Co,not-an-email,First,Last`);
    expect(rows).toEqual([]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.reason).toContain("invalid owner_email");
  });

  it("skips a data row with a non-numeric legacy_id (not the header)", () => {
    const { rows, skipped } = parseProvidersCsv(
      `${HEADER}\n7,Acme Dental,owner@acme.com,Jane,Doe\nABC,Broken,owner@x.com,J,D`,
    );
    expect(rows).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ lineNo: 3, reason: 'bad legacy_id "ABC"' });
  });

  it("skips rows with too few columns", () => {
    const { rows, skipped } = parseProvidersCsv(`${HEADER}\n13,Only Three,owner@x.com`);
    expect(rows).toEqual([]);
    expect(skipped[0]!.reason).toContain("expected 5 columns");
  });

  it("ignores blank lines and # comments", () => {
    const { rows, skipped } = parseProvidersCsv(
      `${HEADER}\n\n# a note\n7,Acme Dental,owner@acme.com,Jane,Doe\n`,
    );
    expect(skipped).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.legacyId).toBe(7);
  });

  it("works without a header row (first line is data)", () => {
    const { rows, skipped } = parseProvidersCsv(`7,Acme Dental,owner@acme.com,Jane,Doe`);
    expect(skipped).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.legacyId).toBe(7);
  });

  it("tolerates blank owner_first / owner_last (nullable downstream)", () => {
    const { rows } = parseProvidersCsv(`${HEADER}\n7,Acme Dental,owner@acme.com,,`);
    expect(rows[0]).toMatchObject({ ownerFirst: "", ownerLast: "" });
  });
});

describe("companyNamesMatch", () => {
  it("matches ignoring case and surrounding whitespace", () => {
    expect(companyNamesMatch("Acme Dental", "  acme dental ")).toBe(true);
    expect(companyNamesMatch("Pearl, Inc.", "pearl, inc.")).toBe(true);
  });
  it("flags a genuine mismatch", () => {
    expect(companyNamesMatch("Acme", "Acme Group")).toBe(false);
    expect(companyNamesMatch("Bright Smiles", "Brite Smiles")).toBe(false);
  });
});

describe("isValidProviderEmail", () => {
  it("accepts a normal address", () => {
    expect(isValidProviderEmail("owner@acme.com")).toBe(true);
  });
  it("rejects blanks and malformed addresses", () => {
    expect(isValidProviderEmail("")).toBe(false);
    expect(isValidProviderEmail("not-an-email")).toBe(false);
    expect(isValidProviderEmail("owner@localhost")).toBe(false);
    expect(isValidProviderEmail("a b@x.com")).toBe(false);
  });
});
