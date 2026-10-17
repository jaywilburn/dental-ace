import { describe, it, expect, vi, beforeEach } from "vitest";

/*
  setCompanyFeature: row lock, no-op when unchanged, audit row in the same
  transaction, and an allowlisted feature name.
*/

const { requireStaff, recordAdminAction, txMock, prismaMock, redirectMock } = vi.hoisted(() => {
  const txMock = {
    $executeRaw: vi.fn(),
    company: { findUnique: vi.fn(), update: vi.fn() },
  };
  return {
    requireStaff: vi.fn(),
    recordAdminAction: vi.fn(),
    txMock,
    prismaMock: {
      $transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
    },
    redirectMock: vi.fn((url: string): never => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
  };
});

vi.mock("@/lib/auth/session", () => ({ requireStaff }));
vi.mock("@/lib/admin/audit", () => ({ recordAdminAction }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { setCompanyFeature } from "@/lib/admin/company-features";

const COMPANY = "5425fb59-0000-4000-8000-000000000001";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireStaff.mockResolvedValue({ id: "admin-1" });
  txMock.company.findUnique.mockResolvedValue({
    name: "AADB",
    surveyEnabled: false,
    attendanceCodesEnabled: true,
  });
});

describe("setCompanyFeature", () => {
  it("locks the row, flips the flag and audits the change in the same transaction", async () => {
    await expect(
      setCompanyFeature(form({ companyId: COMPANY, feature: "surveyEnabled", enabled: "true" })),
    ).rejects.toThrow(`NEXT_REDIRECT:/admin/companies/${COMPANY}?ok=feature&feature=surveyEnabled`);
    expect(requireStaff).toHaveBeenCalledWith("ADMIN");
    expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
    expect(txMock.company.update).toHaveBeenCalledWith({
      where: { id: COMPANY },
      data: { surveyEnabled: true },
    });
    expect(recordAdminAction).toHaveBeenCalledWith(txMock, {
      actorUserId: "admin-1",
      action: "COMPANY_FEATURE_CHANGED",
      summary: 'Turned on event surveys for "AADB"',
      details: { companyId: COMPANY, companyName: "AADB", feature: "surveyEnabled", from: false, to: true },
    });
  });

  it("is a no-op with no audit row when the flag already has that value", async () => {
    await expect(
      setCompanyFeature(form({ companyId: COMPANY, feature: "attendanceCodesEnabled", enabled: "true" })),
    ).rejects.toThrow("NEXT_REDIRECT:");
    expect(txMock.company.update).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it("refuses a feature outside the allowlist before touching the DB", async () => {
    await expect(
      setCompanyFeature(form({ companyId: COMPANY, feature: "certBalance", enabled: "true" })),
    ).rejects.toThrow("NEXT_REDIRECT:/admin/companies?error=");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("redirects when the company does not exist", async () => {
    txMock.company.findUnique.mockResolvedValue(null);
    await expect(
      setCompanyFeature(form({ companyId: COMPANY, feature: "surveyEnabled", enabled: "true" })),
    ).rejects.toThrow("NEXT_REDIRECT:/admin/companies?error=");
    expect(recordAdminAction).not.toHaveBeenCalled();
  });
});
