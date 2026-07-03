import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-1234";
});

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

import { GET } from "@/app/api/protrack/claim-certificate/route";
import { signCertClaimToken } from "@/lib/protrack/cert-claim-token";
import { render } from "@react-email/components";
import CertificateIssuedEmail from "@/emails/certificate-issued";

const issuedRow = {
  id: "cert-1",
  passed: true,
  attendeeEmail: "attendee@example.com",
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

function call(token: string) {
  return GET(
    new NextRequest(`http://localhost:3000/api/protrack/claim-certificate?token=${token}`),
  );
}

afterEach(() => vi.clearAllMocks());

describe("GET /api/protrack/claim-certificate", () => {
  it("valid token + matching account -> attaches and redirects to /protrack", async () => {
    findUnique.mockResolvedValue(issuedRow);
    findFirst.mockResolvedValue({ id: "user-9" });
    createMany.mockResolvedValue({ count: 1 });

    const res = await call(signCertClaimToken("cert-1"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost:3000/protrack?claimed=1");
    expect(createMany).toHaveBeenCalledOnce();
  });

  it("valid token + no account -> redirects to /signup prefilled, writes nothing", async () => {
    findUnique.mockResolvedValue(issuedRow);
    findFirst.mockResolvedValue(null);

    const res = await call(signCertClaimToken("cert-1"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/signup?email=attendee%40example.com",
    );
    expect(createMany).not.toHaveBeenCalled();
  });

  it("bad token -> redirects to login with an error, touches no DB", async () => {
    const res = await call("garbage.token");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login?error=cert_claim");
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe("certificate email renders with the claim link", () => {
  it("uses the claim URL and the honest CTA label", async () => {
    const html = await render(
      CertificateIssuedEmail({
        attendeeName: "Sarah",
        courseTitle: "Sealants Update",
        courseIdNumber: "ACE-1001",
        certificateId: "cert-1",
        ceHours: 2,
        completedAt: "January 1, 2026",
        verifyUrl: "http://localhost:3000/attend/tok",
        claimUrl: "http://localhost:3000/api/protrack/claim-certificate?token=abc",
      }),
    );
    expect(html).toContain("/api/protrack/claim-certificate?token=abc");
    expect(html).toContain("Add this certificate to ProTrack");
    expect(html).not.toContain("Activate my ProTrack Account");
  });
});
