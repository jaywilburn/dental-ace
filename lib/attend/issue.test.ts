import { describe, it, expect, vi } from "vitest";
import { issueCertificateTx, CertBalanceExhaustedError } from "@/lib/attend/issue";

function fakeTx(certBalance: number) {
  return {
    company: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ certBalance }),
      update: vi.fn().mockResolvedValue({}),
    },
    accreditedCourse: { update: vi.fn().mockResolvedValue({}) },
    issuedCertificate: {
      create: vi.fn().mockResolvedValue({ id: "cert-1" }),
    },
  };
}

const baseInput = {
  courseId: "course-1",
  companyId: "company-1",
  attendeeName: "Jane",
  attendeeEmail: "jane@example.com",
  licenseNumber: "TX-1",
  licenseType: "RDH",
  licenseStates: ["TX"],
  deliveryMethod: "Online (self-study)",
  courseType: "Infection Control",
  quizResponses: [{ type: "TF", answer: "True" }],
  score: 4,
};

describe("issueCertificateTx", () => {
  it("decrements balance, bumps counters, and inserts a passed cert", async () => {
    const tx = fakeTx(5);
    // @ts-expect-error fake tx shape
    const result = await issueCertificateTx(tx, baseInput);

    expect(result).toEqual({ id: "cert-1" });
    expect(tx.company.update).toHaveBeenCalledWith({
      where: { id: "company-1" },
      data: { certBalance: { decrement: 1 }, totalCertsIssued: { increment: 1 } },
    });
    expect(tx.accreditedCourse.update).toHaveBeenCalledWith({
      where: { id: "course-1" },
      data: { certsIssuedCount: { increment: 1 } },
    });
    expect(tx.issuedCertificate.create).toHaveBeenCalledOnce();
    const createArg = tx.issuedCertificate.create.mock.calls[0][0];
    expect(createArg.data.passed).toBe(true);
    expect(createArg.data.score).toBe(4);
  });

  it("issues the last certificate when balance is exactly 1", async () => {
    const tx = fakeTx(1);
    // @ts-expect-error fake tx shape
    const result = await issueCertificateTx(tx, baseInput);
    expect(result).toEqual({ id: "cert-1" });
    expect(tx.company.update).toHaveBeenCalledWith({
      where: { id: "company-1" },
      data: { certBalance: { decrement: 1 }, totalCertsIssued: { increment: 1 } },
    });
    expect(tx.issuedCertificate.create).toHaveBeenCalledOnce();
  });

  it("throws CertBalanceExhaustedError and never mutates when balance is 0", async () => {
    const tx = fakeTx(0);
    await expect(
      // @ts-expect-error fake tx shape
      issueCertificateTx(tx, baseInput),
    ).rejects.toBeInstanceOf(CertBalanceExhaustedError);
    expect(tx.company.update).not.toHaveBeenCalled();
    expect(tx.issuedCertificate.create).not.toHaveBeenCalled();
  });
});
