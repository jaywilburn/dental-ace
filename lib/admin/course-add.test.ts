import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Prisma } from "@prisma/client";
import { DA236_FIELDS, formData } from "@/lib/admin/course-add.fixture";

/*
  addApprovedCourse: admin-only; validation failures come back as field errors
  with the typed values (never a redirect, never a DB write); success creates
  the APPROVED stub application + course + COURSE_ADDED audit row in one
  transaction under the company lock, takes no credit, renders assets after
  commit and redirects to the company's Courses section. A duplicate course ID,
  in any case, is a field error on courseIdNumber.
*/

const { requireStaff, recordAdminAction, renderCourseAssets, txMock, prismaMock, redirectMock } = vi.hoisted(() => {
  const txMock = {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    accreditedCourse: { findFirst: vi.fn(), create: vi.fn() },
    courseApplication: { create: vi.fn() },
    company: { update: vi.fn() },
    adminCourseDraft: { deleteMany: vi.fn() },
  };
  return {
    requireStaff: vi.fn(),
    recordAdminAction: vi.fn(),
    renderCourseAssets: vi.fn(),
    txMock,
    prismaMock: {
      $transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
      company: { findUnique: vi.fn() },
      adminCourseDraft: { updateMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    },
    redirectMock: vi.fn((url: string): never => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
  };
});

vi.mock("@/lib/auth/session", () => ({ requireStaff }));
vi.mock("@/lib/admin/audit", () => ({ recordAdminAction }));
vi.mock("@/lib/reviewer/accredit", () => ({ renderCourseAssets }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addApprovedCourse, discardCourseDraft } from "@/lib/admin/course-add";

const COMPANY = "c40121e2-7cb3-4127-9abb-268880f41b1b";
const APP = "0b6c0f4e-5f43-4d7c-9a53-2a1a54b0b111";
const COURSE = "7d1f6a0e-3c2b-4b8e-8f0a-6c1d2e3f4a55";
const DRAFT = "3e4f5a6b-7c8d-4e9f-a0b1-c2d3e4f5a6b7";

function post(overrides: Record<string, string> = {}): FormData {
  return formData({ companyId: COMPANY, ...DA236_FIELDS, ...overrides });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-29T15:00:00Z"));
  requireStaff.mockResolvedValue({ id: "admin-1" });
  txMock.$queryRaw.mockResolvedValue([{ name: "Emme Sanders RDH" }]);
  txMock.accreditedCourse.findFirst.mockResolvedValue(null);
  txMock.courseApplication.create.mockResolvedValue({ id: APP });
  txMock.accreditedCourse.create.mockResolvedValue({ id: COURSE });
  prismaMock.company.findUnique.mockResolvedValue({ id: COMPANY });
  prismaMock.adminCourseDraft.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.adminCourseDraft.create.mockResolvedValue({ id: DRAFT });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("addApprovedCourse", () => {
  it("refuses a non-admin before touching the DB", async () => {
    requireStaff.mockRejectedValue(new Error("NEXT_REDIRECT:/home"));
    await expect(addApprovedCourse(null, post())).rejects.toThrow("NEXT_REDIRECT:/home");
    expect(requireStaff).toHaveBeenCalledWith("ADMIN");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("returns field errors and the typed values without writing anything", async () => {
    const state = await addApprovedCourse(null, post({ ceHours: "", courseIdNumber: "ACE-2026-00099" }));
    expect(state?.errors).toMatchObject({
      ceHours: ["Enter the CE hours."],
      courseIdNumber: [expect.stringMatching(/reserved/)],
    });
    expect(state?.values?.courseTitle).toBe("COLLABricon Ultimate Team Synergy Summit");
    expect(state?.values?.quiz[1]).toMatchObject({ correctAnswer: "False" });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("creates DA236 as an approved course with its quiz, audits it and redirects", async () => {
    await expect(addApprovedCourse(null, post())).rejects.toThrow(
      `NEXT_REDIRECT:/admin/companies/${COMPANY}?ok=course-added#courses`,
    );

    const approvedAt = new Date("2025-10-14T12:00:00Z");
    const expiresAt = new Date("2028-10-14T12:00:00Z");
    expect(txMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(txMock.accreditedCourse.findFirst).toHaveBeenCalledWith({
      where: { courseIdNumber: { equals: "ACE-LEG-00124", mode: "insensitive" } },
      select: { id: true },
    });
    expect(txMock.courseApplication.create).toHaveBeenCalledWith({
      data: {
        companyId: COMPANY,
        status: "APPROVED",
        courseTitle: "COLLABricon Ultimate Team Synergy Summit",
        ceHours: 6,
        courseType: "Business/Practice Management",
        deliveryMethod: "LIVE In Person",
        applicationData: { legacy: true, legacyCourseId: "DA236", source: "admin-added" },
        submittedAt: approvedAt,
        reviewedAt: approvedAt,
        reviewedById: "admin-1",
      },
      select: { id: true },
    });
    const courseData = txMock.accreditedCourse.create.mock.calls[0][0].data;
    expect(courseData).toMatchObject({
      applicationId: APP,
      companyId: COMPANY,
      courseIdNumber: "ACE-LEG-00124",
      approvedAt,
      expiresAt,
      qrCodeUrl: `qrcodes/${APP}.png`,
      approvalLetterUrl: `approval-letters/${APP}.pdf`,
    });
    expect(courseData.quizQuestions).toHaveLength(5);
    expect(courseData.quizQuestions[4]).toEqual({
      type: "MC",
      question: "Which phrase best captures the goal of COLLABricon?",
      options: [
        "Learn alone, lead alone",
        "Vision, Action, Transformation",
        "Profit over people",
        "Individual success stories",
      ],
      correctIndex: 1,
    });

    expect(recordAdminAction).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({
        actorUserId: "admin-1",
        action: "COURSE_ADDED",
        summary: 'Added approved course ACE-LEG-00124 "COLLABricon Ultimate Team Synergy Summit" to Emme Sanders RDH',
        details: expect.objectContaining({
          companyId: COMPANY,
          companyName: "Emme Sanders RDH",
          courseId: COURSE,
          approvedAt: "2025-10-14",
          expiresAt: "2028-10-14",
          legacyCourseId: "DA236",
        }),
      }),
    );

    // No credit is taken: the company row is locked, never updated.
    expect(txMock.company.update).not.toHaveBeenCalled();
    expect(renderCourseAssets).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: APP,
        courseIdNumber: "ACE-LEG-00124",
        attendeeLinkToken: courseData.attendeeLinkToken,
        companyName: "Emme Sanders RDH",
        ceHours: 6,
        deliveryMethod: "LIVE In Person",
      }),
    );
  });

  it("refuses a course ID already in use, in any case, as a field error", async () => {
    txMock.accreditedCourse.findFirst.mockResolvedValue({ id: "other" });
    const state = await addApprovedCourse(null, post({ courseIdNumber: "ace-leg-00109" }));
    expect(state?.errors).toEqual({
      courseIdNumber: ["Course ID ace-leg-00109 is already in use. Each course needs its own ID."],
    });
    expect(state?.values?.courseIdNumber).toBe("ace-leg-00109");
    expect(txMock.courseApplication.create).not.toHaveBeenCalled();
    expect(renderCourseAssets).not.toHaveBeenCalled();
  });

  it("turns a unique-index race into the same field error", async () => {
    txMock.accreditedCourse.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "6" }),
    );
    const state = await addApprovedCourse(null, post());
    expect(state?.errors.courseIdNumber?.[0]).toMatch(/already in use/);
    expect(renderCourseAssets).not.toHaveBeenCalled();
  });

  it("reports a company that no longer exists", async () => {
    txMock.$queryRaw.mockResolvedValue([]);
    const state = await addApprovedCourse(null, post());
    expect(state?.errors).toEqual({ _form: ["This company no longer exists."] });
  });

  it("rejects a tampered company id without touching the DB", async () => {
    const state = await addApprovedCourse(null, post({ companyId: "not-a-uuid" }));
    expect(state?.errors._form?.[0]).toMatch(/could not be read/);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe("course drafts", () => {
  it("adding the course deletes the draft it came from, in the same transaction", async () => {
    await expect(addApprovedCourse(null, post({ draftId: DRAFT }))).rejects.toThrow("NEXT_REDIRECT:");
    expect(txMock.adminCourseDraft.deleteMany).toHaveBeenCalledWith({ where: { id: DRAFT, companyId: COMPANY } });
  });

  it("a rejected add keeps the draft", async () => {
    await addApprovedCourse(null, post({ draftId: DRAFT, ceHours: "" }));
    expect(txMock.adminCourseDraft.deleteMany).not.toHaveBeenCalled();
  });

  it("saves a half-finished form as a new draft without validating it", async () => {
    const fd = formData({ companyId: COMPANY, intent: "draft", courseTitle: "COLLABricon Ultimate Team Synergy Summit" });
    prismaMock.adminCourseDraft.updateMany.mockResolvedValue({ count: 0 });
    await expect(addApprovedCourse(null, fd)).rejects.toThrow(
      `NEXT_REDIRECT:/admin/companies/${COMPANY}/courses/new?draft=${DRAFT}&ok=draft-saved`,
    );
    expect(prismaMock.adminCourseDraft.updateMany).not.toHaveBeenCalled();
    const data = prismaMock.adminCourseDraft.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ companyId: COMPANY, createdById: "admin-1", updatedById: "admin-1" });
    expect(data.values).toMatchObject({ courseTitle: "COLLABricon Ultimate Team Synergy Summit", ceHours: "", approvedOn: "" });
    expect(data.values.quiz).toHaveLength(5);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("updates an existing draft of this company in place", async () => {
    await expect(addApprovedCourse(null, post({ intent: "draft", draftId: DRAFT }))).rejects.toThrow(
      `?draft=${DRAFT}&ok=draft-saved`,
    );
    expect(prismaMock.adminCourseDraft.updateMany).toHaveBeenCalledWith({
      where: { id: DRAFT, companyId: COMPANY },
      data: { values: expect.objectContaining({ courseIdNumber: "ACE-LEG-00124" }), updatedById: "admin-1" },
    });
    expect(prismaMock.adminCourseDraft.create).not.toHaveBeenCalled();
  });

  it("keeps the work as a new draft when the old one was discarded meanwhile", async () => {
    prismaMock.adminCourseDraft.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.adminCourseDraft.create.mockResolvedValue({ id: "9e4f5a6b-7c8d-4e9f-a0b1-c2d3e4f5a6b7" });
    await expect(addApprovedCourse(null, post({ intent: "draft", draftId: DRAFT }))).rejects.toThrow(
      "?draft=9e4f5a6b-7c8d-4e9f-a0b1-c2d3e4f5a6b7&ok=draft-saved",
    );
  });

  it("clamps an oversized (tampered) post instead of storing it", async () => {
    await expect(
      addApprovedCourse(null, post({ intent: "draft", courseTitle: "x".repeat(5000), q1_question: "y".repeat(5000) })),
    ).rejects.toThrow("NEXT_REDIRECT:");
    const values = prismaMock.adminCourseDraft.create.mock.calls[0]?.[0].data.values
      ?? prismaMock.adminCourseDraft.updateMany.mock.calls[0]?.[0].data.values;
    expect(values.courseTitle).toHaveLength(200);
    expect(values.quiz[0].question).toHaveLength(500);
  });

  it("discard deletes only a draft of the given company", async () => {
    await expect(discardCourseDraft(formData({ companyId: COMPANY, draftId: DRAFT }))).rejects.toThrow(
      `NEXT_REDIRECT:/admin/companies/${COMPANY}?ok=draft-discarded#courses`,
    );
    expect(requireStaff).toHaveBeenCalledWith("ADMIN");
    expect(prismaMock.adminCourseDraft.deleteMany).toHaveBeenCalledWith({ where: { id: DRAFT, companyId: COMPANY } });
  });
});
