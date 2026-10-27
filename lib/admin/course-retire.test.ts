import { describe, it, expect, vi, beforeEach } from "vitest";

/*
  retireCourse: admin-only, company row lock, refuses an already-retired course,
  takes the course's PASSED certificates out of total_certs_issued (floored at
  zero), writes a COURSE_RETIRED audit row in the same transaction, and never
  touches cert_balance or the certificates themselves.
*/

const { requireStaff, recordAdminAction, txMock, prismaMock, redirectMock } = vi.hoisted(() => {
  const txMock = {
    $executeRaw: vi.fn(),
    accreditedCourse: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    issuedCertificate: { count: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    ceCertificate: { update: vi.fn(), updateMany: vi.fn() },
    company: { update: vi.fn() },
  };
  return {
    requireStaff: vi.fn(),
    recordAdminAction: vi.fn(),
    txMock,
    prismaMock: {
      $transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
      accreditedCourse: { findUnique: vi.fn() },
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

import { retireCourse } from "@/lib/admin/course-retire";

const COURSE = "ffae9010-1846-4fc9-b973-031819165c61";
const COMPANY = "abf1ca01-28de-46a2-b3e1-23b97ef4255b";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function lockedCourse(overrides: Partial<{ retiredAt: Date | null; eventId: string | null; total: number }> = {}) {
  return {
    courseIdNumber: "ACE-LEG-00023",
    eventId: overrides.eventId ?? null,
    retiredAt: overrides.retiredAt ?? null,
    company: { name: "Limitless on Demand", totalCertsIssued: overrides.total ?? 68 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireStaff.mockResolvedValue({ id: "admin-1" });
  txMock.accreditedCourse.findUnique.mockResolvedValue({ companyId: COMPANY });
  txMock.accreditedCourse.findUniqueOrThrow.mockResolvedValue(lockedCourse());
  txMock.issuedCertificate.count.mockResolvedValue(16);
});

describe("retireCourse", () => {
  it("refuses a non-admin before touching the DB", async () => {
    requireStaff.mockRejectedValue(new Error("NEXT_REDIRECT:/home"));
    await expect(retireCourse(form({ courseId: COURSE, reason: "Not theirs" }))).rejects.toThrow(
      "NEXT_REDIRECT:/home",
    );
    expect(requireStaff).toHaveBeenCalledWith("ADMIN");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("locks the company, stamps retiredAt, decrements the total and audits in one transaction", async () => {
    await expect(
      retireCourse(form({ courseId: COURSE, reason: "  Limitless says DA245 is not their course " })),
    ).rejects.toThrow(`NEXT_REDIRECT:/admin/companies/${COMPANY}?ok=course-retired`);

    expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
    expect(txMock.issuedCertificate.count).toHaveBeenCalledWith({ where: { courseId: COURSE, passed: true } });
    expect(txMock.accreditedCourse.update).toHaveBeenCalledWith({
      where: { id: COURSE },
      data: { retiredAt: expect.any(Date) },
    });
    expect(txMock.company.update).toHaveBeenCalledWith({
      where: { id: COMPANY },
      data: { totalCertsIssued: 52 },
    });
    expect(recordAdminAction).toHaveBeenCalledWith(txMock, {
      actorUserId: "admin-1",
      targetUserId: null,
      action: "COURSE_RETIRED",
      summary: 'Retired course ACE-LEG-00023 from "Limitless on Demand" (16 certificates hidden from the company)',
      details: {
        courseId: COURSE,
        courseIdNumber: "ACE-LEG-00023",
        companyId: COMPANY,
        companyName: "Limitless on Demand",
        certsHidden: 16,
        totalBefore: 68,
        totalAfter: 52,
        reason: "Limitless says DA245 is not their course",
      },
    });
  });

  it("never touches cert_balance, issued certificates or ProTrack records", async () => {
    await expect(retireCourse(form({ courseId: COURSE, reason: "Not theirs" }))).rejects.toThrow(
      "NEXT_REDIRECT:",
    );
    const companyData = txMock.company.update.mock.calls[0][0].data;
    expect(Object.keys(companyData)).toEqual(["totalCertsIssued"]);
    expect(txMock.issuedCertificate.update).not.toHaveBeenCalled();
    expect(txMock.issuedCertificate.updateMany).not.toHaveBeenCalled();
    expect(txMock.ceCertificate.update).not.toHaveBeenCalled();
    expect(txMock.ceCertificate.updateMany).not.toHaveBeenCalled();
  });

  it("floors total_certs_issued at zero", async () => {
    txMock.accreditedCourse.findUniqueOrThrow.mockResolvedValue(lockedCourse({ total: 5 }));
    await expect(retireCourse(form({ courseId: COURSE, reason: "Not theirs" }))).rejects.toThrow(
      "NEXT_REDIRECT:",
    );
    expect(txMock.company.update).toHaveBeenCalledWith({
      where: { id: COMPANY },
      data: { totalCertsIssued: 0 },
    });
    expect(recordAdminAction.mock.calls[0][1].details).toMatchObject({
      certsHidden: 16,
      totalBefore: 5,
      totalAfter: 0,
    });
  });

  it("refuses an already-retired course with no writes", async () => {
    txMock.accreditedCourse.findUniqueOrThrow.mockResolvedValue(lockedCourse({ retiredAt: new Date() }));
    await expect(retireCourse(form({ courseId: COURSE, reason: "Again" }))).rejects.toThrow(
      `NEXT_REDIRECT:/admin/companies/${COMPANY}?error=${encodeURIComponent("This course is already retired.")}`,
    );
    expect(txMock.accreditedCourse.update).not.toHaveBeenCalled();
    expect(txMock.company.update).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it("refuses an event-scoped course", async () => {
    txMock.accreditedCourse.findUniqueOrThrow.mockResolvedValue(lockedCourse({ eventId: "evt-1" }));
    await expect(retireCourse(form({ courseId: COURSE, reason: "Not theirs" }))).rejects.toThrow(
      `NEXT_REDIRECT:/admin/companies/${COMPANY}?error=`,
    );
    expect(txMock.accreditedCourse.update).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it("redirects back to the company when the reason is blank", async () => {
    prismaMock.accreditedCourse.findUnique.mockResolvedValue({ companyId: COMPANY });
    await expect(retireCourse(form({ courseId: COURSE, reason: "   " }))).rejects.toThrow(
      `NEXT_REDIRECT:/admin/companies/${COMPANY}?error=`,
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("redirects to the company list when the course does not exist", async () => {
    txMock.accreditedCourse.findUnique.mockResolvedValue(null);
    await expect(retireCourse(form({ courseId: COURSE, reason: "Not theirs" }))).rejects.toThrow(
      "NEXT_REDIRECT:/admin/companies?error=",
    );
    expect(recordAdminAction).not.toHaveBeenCalled();
  });
});
