import { afterEach, describe, expect, it, vi } from "vitest";

/*
  claimIssuedCertificate is the email-proven forward attach: it only runs from
  the claim route (after the recipient clicks a link mailed to attendeeEmail), so
  these cases cover the three outcomes the route branches on. prisma is mocked so
  this stays a pure unit test.
*/
const { findUnique, findFirst, createMany } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  createMany: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    issuedCertificate: { findUnique },
    user: { findFirst },
    ceCertificate: { createMany },
  },
}));

import { claimIssuedCertificate } from "@/lib/protrack/ace-sync";

const issuedRow = {
  id: "cert-1",
  passed: true,
  attendeeEmail: "Attendee@Example.com",
  courseType: "Clinical",
  deliveryMethod: "Live Event",
  certPdfUrl: "cert-1.pdf",
  completedAt: new Date("2026-01-01"),
  ceHours: null,
  issuedAt: new Date("2026-01-02"),
  company: { name: "Texas Dental Association" },
  course: { application: { ceHours: 2, courseTitle: "Sealants Update" } },
  event: null,
};

afterEach(() => vi.clearAllMocks());

describe("claimIssuedCertificate", () => {
  it("attaches to a matching account and reports attached", async () => {
    findUnique.mockResolvedValue(issuedRow);
    findFirst.mockResolvedValue({ id: "user-9" });
    createMany.mockResolvedValue({ count: 1 });

    const r = await claimIssuedCertificate("cert-1");

    expect(r).toEqual({ status: "attached", email: "Attendee@Example.com" });
    // email match is case-insensitive
    expect(findFirst.mock.calls[0][0].where.email).toEqual({
      equals: "Attendee@Example.com",
      mode: "insensitive",
    });
    // attaches to the matched user, idempotently
    const createArg = createMany.mock.calls[0][0];
    expect(createArg.data[0].licenseeId).toBe("user-9");
    expect(createArg.data[0].issuedCertificateId).toBe("cert-1");
    expect(createArg.skipDuplicates).toBe(true);
  });

  it("reports no_account (and writes nothing) when nobody registered that email", async () => {
    findUnique.mockResolvedValue(issuedRow);
    findFirst.mockResolvedValue(null);

    const r = await claimIssuedCertificate("cert-1");

    expect(r).toEqual({ status: "no_account", email: "Attendee@Example.com" });
    expect(createMany).not.toHaveBeenCalled();
  });

  it("reports invalid for an unknown certificate id", async () => {
    findUnique.mockResolvedValue(null);
    const r = await claimIssuedCertificate("nope");
    expect(r).toEqual({ status: "invalid" });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("reports invalid (never looks up a user) for a non-passing certificate", async () => {
    findUnique.mockResolvedValue({ ...issuedRow, passed: false });
    const r = await claimIssuedCertificate("cert-1");
    expect(r).toEqual({ status: "invalid" });
    expect(findFirst).not.toHaveBeenCalled();
  });
});
