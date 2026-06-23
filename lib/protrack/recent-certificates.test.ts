import { describe, expect, it } from "vitest";
import {
  RECENT_CERTIFICATES_LIMIT,
  recentCertificates,
} from "./progress";

describe("recentCertificates", () => {
  const make = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: i }));

  it("defaults to the dashboard limit of 5", () => {
    expect(RECENT_CERTIFICATES_LIMIT).toBe(5);
    expect(recentCertificates(make(6))).toHaveLength(5);
  });

  it("returns the first N (newest-first input is preserved, not re-sorted)", () => {
    const certs = make(6); // ids 0..5, already newest-first by contract
    expect(recentCertificates(certs).map((c) => c.id)).toEqual([0, 1, 2, 3, 4]);
  });

  it("returns all certificates when there are fewer than the limit", () => {
    expect(recentCertificates(make(3))).toHaveLength(3);
  });

  it("returns an empty array for no certificates", () => {
    expect(recentCertificates([])).toEqual([]);
  });

  it("respects an explicit limit", () => {
    expect(recentCertificates(make(10), 3)).toHaveLength(3);
  });

  it("clamps a negative limit to zero", () => {
    expect(recentCertificates(make(4), -2)).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const certs = make(6);
    recentCertificates(certs);
    expect(certs).toHaveLength(6);
  });
});
