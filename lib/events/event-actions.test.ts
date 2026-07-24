import { describe, it, expect, vi, beforeEach } from "vitest";

/*
  submitEvent completeness gate for SELECTIVE_INLINE events. Each session now
  carries its OWN full application (Course Info + Creator + Presenters) plus one
  MC question, all on event_sessions; there is no event-level application. The
  event flips DRAFT -> PENDING only when at least one session exists and every
  session's full application + question validate. Crucially the flow creates NO
  CourseApplication rows (approveEvent keys the lightweight-vs-full-course model
  on pending session applications existing), and bills one credit per session.
*/

const { getCurrentUser, prismaMock, txMock, redirectMock, sendEmail } = vi.hoisted(() => {
  const txMock = {
    $executeRaw: vi.fn(),
    company: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    courseApplication: { deleteMany: vi.fn(), create: vi.fn() },
    event: { updateMany: vi.fn() },
  };
  return {
    getCurrentUser: vi.fn(),
    txMock,
    prismaMock: {
      event: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      company: { findUnique: vi.fn() },
      $transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
    },
    redirectMock: vi.fn((url: string): never => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
    sendEmail: vi.fn(),
  };
});

vi.mock("@/lib/auth/session", () => ({ getCurrentUser }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: () => "127.0.0.1" })),
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(() => ({ ok: true })) }));
vi.mock("@/lib/email/send", () => ({ sendEmail }));
vi.mock("@/emails/application-submitted", () => ({
  default: Object.assign(vi.fn(() => null), { subject: vi.fn(() => "Submitted") }),
}));
vi.mock("@/lib/reviewer/notify", () => ({
  getReviewerNotificationRecipients: vi.fn(async () => []),
  reviewerNotificationToAddress: vi.fn(() => "reviews@dentalace.org"),
}));

import { submitEvent } from "@/lib/events/event-actions";

const CREATOR_SLICE = {
  creatorName: "Dr. Jane Doe",
  credentials: "DDS",
  currentPosition: "Program Director",
  detailedBioHtml: "<p>Twenty years of implant dentistry education and practice.</p>",
  creatorEmail: "jane@example.com",
  creatorPhone: "555-123-4567",
  creatorAddress: "Austin, TX 78701",
  highestDegree: "Doctoral",
  educationPart1: "UT Austin, DDS, 2001",
  educationPart4: "N/A",
  creatorExperience: "20 years placing implants in private practice.",
};

const PRESENTERS_SLICE = {
  presenters: [
    {
      name: "Dr. Jane Doe",
      role: "Primary Presenter",
      commercialDisclosure: "No relevant financial relationships to disclose",
      experience: "Doe, Jane. 20 years of implant dentistry.",
      training: "4 hours of live train-the-trainer instruction",
      bio: "Dr. Jane Doe, DDS, Program Director.",
    },
  ],
};

const MC_QUESTION = {
  type: "MC",
  question: "What is the key takeaway from Session A?",
  options: ["a", "b", "c", "d"],
  correctIndex: 0,
};

// Valid FULL per-session application (Course Info + Creator + Presenters).
function sessionInfo(title: string, hours: number) {
  return {
    courseTitle: title,
    ceCreditHours: hours,
    subjectMatter: "Scientific",
    deliveryFormat: "LIVE In Person",
    primaryDistributionFormat: "Live/In Person",
    shortDescription:
      "A focused session on modern clinical protocols for general practice.",
    publicProtectionStatement:
      "Participants learn monitoring standards that keep patients safe.",
    courseObjectives: "1. Learn A\n2. Apply B\n3. Manage C",
    courseOutline: "Part 1: overview. Part 2: practice. Part 3: review.",
    ...CREATOR_SLICE,
    ...PRESENTERS_SLICE,
  };
}

function draftEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    name: "Annual Meeting",
    eventDate: "June 14-15, 2026",
    eventType: "SELECTIVE_INLINE",
    totalHours: null,
    eventData: {
      organizationName: "Texas Dental Association",
    },
    company: { name: "Texas Dental Association" },
    sessions: [
      {
        id: "s1",
        courseId: null,
        name: "Session A",
        durationHours: 1.5,
        question: MC_QUESTION,
        courseInfo: sessionInfo("Session A", 1.5),
      },
      {
        id: "s2",
        courseId: null,
        name: "Session B",
        durationHours: 2,
        question: MC_QUESTION,
        courseInfo: sessionInfo("Session B", 2),
      },
    ],
    sessionApplications: [],
    ...overrides,
  };
}

function submitForm(): FormData {
  const fd = new FormData();
  fd.set("eventId", "event-1");
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "user-1", companyId: "company-1" });
  prismaMock.company.findUnique.mockResolvedValue({ applicationCredits: 5 });
  txMock.company.findUniqueOrThrow.mockResolvedValue({ applicationCredits: 5 });
  txMock.event.updateMany.mockResolvedValue({ count: 1 });
});

describe("submitEvent — SELECTIVE_INLINE completeness gate", () => {
  it("requires at least one session", async () => {
    prismaMock.event.findFirst.mockResolvedValue(draftEvent({ sessions: [] }));
    await expect(submitEvent(submitForm())).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/events\/new\/sessions\?error=validation/,
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("blocks submit when a session has no course info", async () => {
    const base = draftEvent();
    const sessions = (base.sessions as Array<Record<string, unknown>>).map((s, i) =>
      i === 1 ? { ...s, courseInfo: null } : s,
    );
    prismaMock.event.findFirst.mockResolvedValue({ ...base, sessions });
    await expect(submitEvent(submitForm())).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/events\/new\/sessions\?error=validation/,
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("blocks submit when a session carries only the course-info slice (creator/presenters missing)", async () => {
    const base = draftEvent();
    const sessions = (base.sessions as Array<Record<string, unknown>>).map((s, i) =>
      i === 0
        ? {
            ...s,
            // step1-only course info: no creator or presenters yet.
            courseInfo: {
              courseTitle: "Session A",
              ceCreditHours: 1.5,
              subjectMatter: "Scientific",
              deliveryFormat: "LIVE In Person",
              primaryDistributionFormat: "Live/In Person",
              shortDescription:
                "A focused session on modern clinical protocols for general practice.",
              publicProtectionStatement:
                "Participants learn monitoring standards that keep patients safe.",
              courseObjectives: "1. Learn A\n2. Apply B\n3. Manage C",
              courseOutline: "Part 1: overview. Part 2: practice. Part 3: review.",
            },
          }
        : s,
    );
    prismaMock.event.findFirst.mockResolvedValue({ ...base, sessions });
    await expect(submitEvent(submitForm())).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/events\/new\/sessions\?error=validation/,
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("blocks submit when a session's course info is only partly filled", async () => {
    const base = draftEvent();
    const sessions = (base.sessions as Array<Record<string, unknown>>).map((s, i) =>
      i === 0
        ? { ...s, courseInfo: { ...sessionInfo("Session A", 1.5), shortDescription: "" } }
        : s,
    );
    prismaMock.event.findFirst.mockResolvedValue({ ...base, sessions });
    await expect(submitEvent(submitForm())).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/events\/new\/sessions\?error=validation/,
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("moves the event to PENDING (one credit per session) when every session is complete", async () => {
    prismaMock.event.findFirst.mockResolvedValue(draftEvent());
    await expect(submitEvent(submitForm())).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/events\?just=submitted/,
    );
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.company.update).toHaveBeenCalledWith({
      where: { id: "company-1" },
      data: { applicationCredits: { decrement: 2 } },
    });
    expect(txMock.event.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "event-1", companyId: "company-1", status: "DRAFT" },
        data: expect.objectContaining({ status: "PENDING" }),
      }),
    );
  });

  it("creates NO CourseApplication rows (keeps the lightweight-inline model discriminator)", async () => {
    prismaMock.event.findFirst.mockResolvedValue(draftEvent());
    await expect(submitEvent(submitForm())).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/events\?just=submitted/,
    );
    expect(txMock.courseApplication.create).not.toHaveBeenCalled();
  });
});
