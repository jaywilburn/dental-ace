import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formData } from "@/lib/admin/course-add.fixture";

/*
  updateCourseDetails: admin-only; writes only what changed (a legacy
  "Live/Online" shown as "LIVE Online" is not a change), cascades hours to the
  ProTrack records synced from this course, keeps an unchanged approval
  timestamp, mirrors native application_data keys, audits from/to pairs and
  re-renders the letter after commit. Event and retired courses are refused.
*/

const { requireStaff, recordAdminAction, rerenderApprovalLetter, txMock, prismaMock, redirectMock } = vi.hoisted(
  () => {
    const txMock = {
      $executeRaw: vi.fn(),
      accreditedCourse: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
      courseApplication: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
      ceCertificate: { updateMany: vi.fn() },
    };
    return {
      requireStaff: vi.fn(),
      recordAdminAction: vi.fn(),
      rerenderApprovalLetter: vi.fn(),
      txMock,
      prismaMock: {
        $transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
      },
      redirectMock: vi.fn((url: string): never => {
        throw new Error(`NEXT_REDIRECT:${url}`);
      }),
    };
  },
);

vi.mock("@/lib/auth/session", () => ({ requireStaff }));
vi.mock("@/lib/admin/audit", () => ({ recordAdminAction }));
vi.mock("@/lib/admin/course-letter", () => ({ rerenderApprovalLetter }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updateCourseDetails } from "@/lib/admin/course-details";

const COURSE = "ffae9010-1846-4fc9-b973-031819165c61";
const COMPANY = "abf1ca01-28de-46a2-b3e1-23b97ef4255b";
const APP = "0b6c0f4e-5f43-4d7c-9a53-2a1a54b0b111";
// A reviewer approval carries a time of day.
const APPROVED_AT = new Date("2025-03-04T19:22:10Z");
const EXPIRES_AT = new Date("2028-03-04T19:22:10Z");

function post(overrides: Record<string, string> = {}): FormData {
  return formData({
    courseId: COURSE,
    ceHours: "5",
    courseType: "Scientific",
    deliveryMethod: "LIVE Online",
    approvedOn: "2025-03-04",
    ...overrides,
  });
}

function course(overrides: Record<string, unknown> = {}) {
  return {
    courseIdNumber: "ACE-LEG-00017",
    companyId: COMPANY,
    eventId: null,
    retiredAt: null,
    approvedAt: APPROVED_AT,
    expiresAt: EXPIRES_AT,
    approvalLetterUrl: `approval-letters/${APP}.pdf`,
    applicationId: APP,
    company: { name: "OrthoSelect" },
    ...overrides,
  };
}

function application(overrides: Record<string, unknown> = {}) {
  return {
    courseTitle: "DIBS AI Clinical Training",
    ceHours: "5.00",
    courseType: "Scientific",
    deliveryMethod: "Live/Online",
    applicationData: { legacy: true, legacyCourseId: "DA194", source: "legacy-migration-v3" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-29T15:00:00Z"));
  requireStaff.mockResolvedValue({ id: "admin-1" });
  txMock.accreditedCourse.findUnique.mockResolvedValue({ companyId: COMPANY, applicationId: APP });
  txMock.accreditedCourse.findUniqueOrThrow.mockResolvedValue(course());
  txMock.courseApplication.findUniqueOrThrow.mockResolvedValue(application());
  txMock.ceCertificate.updateMany.mockResolvedValue({ count: 541 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("updateCourseDetails", () => {
  it("refuses a non-admin before touching the DB", async () => {
    requireStaff.mockRejectedValue(new Error("NEXT_REDIRECT:/home"));
    await expect(updateCourseDetails(post({ ceHours: "6" }))).rejects.toThrow("NEXT_REDIRECT:/home");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("changes only the hours on a legacy course, cascading to ProTrack (the DIBS fix)", async () => {
    await expect(updateCourseDetails(post({ ceHours: "6" }))).rejects.toThrow(
      `NEXT_REDIRECT:/admin/companies/${COMPANY}?ok=course-details#courses`,
    );

    expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
    // Legacy "Live/Online" shown as "LIVE Online" is not a change; the stub
    // has no inline keys to mirror.
    expect(txMock.courseApplication.update).toHaveBeenCalledWith({ where: { id: APP }, data: { ceHours: 6 } });
    expect(txMock.ceCertificate.updateMany).toHaveBeenCalledWith({
      where: { issuedCertificate: { courseId: COURSE } },
      data: { hours: 6 },
    });
    expect(txMock.accreditedCourse.update).not.toHaveBeenCalled();
    expect(recordAdminAction).toHaveBeenCalledWith(txMock, {
      actorUserId: "admin-1",
      action: "COURSE_DETAILS_UPDATED",
      summary: "Updated CE hours on course ACE-LEG-00017",
      details: {
        companyId: COMPANY,
        companyName: "OrthoSelect",
        courseId: COURSE,
        courseIdNumber: "ACE-LEG-00017",
        changes: { ceHours: { from: 5, to: 6 } },
        protrackCertsUpdated: 541,
      },
    });
    expect(rerenderApprovalLetter).toHaveBeenCalledWith(
      {
        path: `approval-letters/${APP}.pdf`,
        companyName: "OrthoSelect",
        courseTitle: "DIBS AI Clinical Training",
        courseIdNumber: "ACE-LEG-00017",
        ceHours: 6,
        deliveryMethod: "Live/Online",
        approvedAt: APPROVED_AT,
        expiresAt: EXPIRES_AT,
      },
      { action: "updateCourseDetails", courseId: COURSE },
    );
  });

  it("moves approval and expiry together when the date changes, stored at noon UTC", async () => {
    await expect(updateCourseDetails(post({ approvedOn: "2025-10-14" }))).rejects.toThrow("NEXT_REDIRECT:");
    expect(txMock.accreditedCourse.update).toHaveBeenCalledWith({
      where: { id: COURSE },
      data: { approvedAt: new Date("2025-10-14T12:00:00Z"), expiresAt: new Date("2028-10-14T12:00:00Z") },
    });
    expect(txMock.ceCertificate.updateMany).not.toHaveBeenCalled();
    // A migrated stub has no review: its detail pages read reviewedAt.
    expect(txMock.courseApplication.update).toHaveBeenCalledWith({
      where: { id: APP },
      data: { reviewedAt: new Date("2025-10-14T12:00:00Z") },
    });
    const audit = recordAdminAction.mock.calls[0][1];
    expect(audit.summary).toBe("Updated approval date on course ACE-LEG-00017");
    expect(audit.details.changes).toEqual({
      approvedAt: { from: "2025-03-04", to: "2025-10-14" },
      expiresAt: { from: "2028-03-04", to: "2028-10-14" },
    });
  });

  it("moves submittedAt too on an admin-added course, never on a reviewed application", async () => {
    txMock.courseApplication.findUniqueOrThrow.mockResolvedValue(
      application({ applicationData: { legacy: true, legacyCourseId: "DA236", source: "admin-added" } }),
    );
    await expect(updateCourseDetails(post({ approvedOn: "2025-10-14" }))).rejects.toThrow("NEXT_REDIRECT:");
    expect(txMock.courseApplication.update.mock.calls[0][0].data).toEqual({
      reviewedAt: new Date("2025-10-14T12:00:00Z"),
      submittedAt: new Date("2025-10-14T12:00:00Z"),
    });

    vi.clearAllMocks();
    txMock.accreditedCourse.findUnique.mockResolvedValue({ companyId: COMPANY, applicationId: APP });
    txMock.accreditedCourse.findUniqueOrThrow.mockResolvedValue(course());
    txMock.courseApplication.findUniqueOrThrow.mockResolvedValue(
      application({ applicationData: { courseTitle: "DIBS", ceCreditHours: 5 } }),
    );
    await expect(updateCourseDetails(post({ approvedOn: "2025-10-14" }))).rejects.toThrow("NEXT_REDIRECT:");
    expect(txMock.courseApplication.update.mock.calls[0][0].data).toEqual({});
  });

  it("mirrors changed fields into a native application's data, leaving other keys alone", async () => {
    txMock.courseApplication.findUniqueOrThrow.mockResolvedValue(
      application({
        deliveryMethod: "LIVE Online",
        applicationData: { courseTitle: "DIBS", ceCreditHours: 5, subjectMatter: "Scientific", deliveryFormat: "LIVE Online" },
      }),
    );
    await expect(
      updateCourseDetails(post({ courseType: "Business/Practice Management", deliveryMethod: "On Demand Recording" })),
    ).rejects.toThrow("NEXT_REDIRECT:");
    expect(txMock.courseApplication.update).toHaveBeenCalledWith({
      where: { id: APP },
      data: {
        courseType: "Business/Practice Management",
        deliveryMethod: "On Demand Recording",
        applicationData: {
          courseTitle: "DIBS",
          ceCreditHours: 5,
          subjectMatter: "Business/Practice Management",
          deliveryFormat: "On Demand Recording",
        },
      },
    });
    expect(rerenderApprovalLetter.mock.calls[0][0].deliveryMethod).toBe("On Demand Recording");
  });

  it("says so when nothing changed, and writes nothing", async () => {
    await expect(updateCourseDetails(post())).rejects.toThrow(
      `NEXT_REDIRECT:/admin/companies/${COMPANY}?error=${encodeURIComponent("Nothing changed.")}#courses`,
    );
    expect(txMock.courseApplication.update).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalled();
    expect(rerenderApprovalLetter).not.toHaveBeenCalled();
  });

  it("refuses event sessions and retired courses", async () => {
    txMock.accreditedCourse.findUniqueOrThrow.mockResolvedValue(course({ eventId: "e1" }));
    await expect(updateCourseDetails(post({ ceHours: "6" }))).rejects.toThrow(/error=.*event/);
    txMock.accreditedCourse.findUniqueOrThrow.mockResolvedValue(course({ retiredAt: new Date() }));
    await expect(updateCourseDetails(post({ ceHours: "6" }))).rejects.toThrow(/error=.*retired/);
    expect(txMock.courseApplication.update).not.toHaveBeenCalled();
  });

  it("reports a validation problem as one message", async () => {
    await expect(updateCourseDetails(post({ ceHours: "41" }))).rejects.toThrow(
      `error=${encodeURIComponent("Enter no more than 40 CE hours.")}`,
    );
    expect(txMock.courseApplication.update).not.toHaveBeenCalled();
  });
});
