import { describe, it, expect, vi, beforeEach } from "vitest";

/*
  submitEvent completeness gate for SELECTIVE_INLINE events: alongside the
  at-least-one-session requirement, the event-level application content
  (Course Information + Creator + Presenters under eventData.eventApplication)
  must validate in full before the event flips DRAFT -> PENDING. An incomplete
  application redirects into its first unfinished step and must never reach the
  credit-charging transaction.
*/

const { getCurrentUser, prismaMock, txMock, redirectMock, sendEmail } = vi.hoisted(() => {
  const txMock = {
    $executeRaw: vi.fn(),
    company: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    courseApplication: { deleteMany: vi.fn() },
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

// Complete event-level application (valid step1 + step2 + step3 slices).
const EVENT_APPLICATION = {
  courseTitle: "Implant Dentistry Update",
  ceCreditHours: 3,
  subjectMatter: "Scientific",
  deliveryFormat: "LIVE In Person",
  primaryDistributionFormat: "Live/In Person",
  shortDescription:
    "A concise overview of modern implant workflows for the general practitioner.",
  publicProtectionStatement:
    "Participants learn safer implant placement protocols that protect patients.",
  courseObjectives:
    "1. Plan implant cases\n2. Place implants safely\n3. Manage complications",
  courseOutline: "Hour 1: planning. Hour 2: placement. Hour 3: complications.",
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

function draftEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    name: "Annual Meeting",
    eventDate: "June 14-15, 2026",
    eventType: "SELECTIVE_INLINE",
    totalHours: null,
    eventData: {
      organizationName: "Texas Dental Association",
      eventApplication: EVENT_APPLICATION,
    },
    company: { name: "Texas Dental Association" },
    sessions: [
      { id: "s1", courseId: null, name: "Session A", durationHours: 1.5, question: MC_QUESTION },
      { id: "s2", courseId: null, name: "Session B", durationHours: 2, question: MC_QUESTION },
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
  it("blocks submit and redirects to the course step when the event application is missing", async () => {
    prismaMock.event.findFirst.mockResolvedValue(
      draftEvent({ eventData: { organizationName: "Texas Dental Association" } }),
    );
    await expect(submitEvent(submitForm())).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/events\/new\/course\?error=validation/,
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("redirects into the first unfinished step when a later slice is incomplete", async () => {
    const partial = Object.fromEntries(
      Object.entries(EVENT_APPLICATION).filter(([k]) => k !== "creatorName"),
    );
    prismaMock.event.findFirst.mockResolvedValue(
      draftEvent({
        eventData: {
          organizationName: "Texas Dental Association",
          eventApplication: partial,
        },
      }),
    );
    await expect(submitEvent(submitForm())).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/events\/new\/creator\?error=validation/,
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("still requires at least one session even when the application is complete", async () => {
    prismaMock.event.findFirst.mockResolvedValue(draftEvent({ sessions: [] }));
    await expect(submitEvent(submitForm())).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/events\/new\/sessions\?error=validation/,
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("moves the event to PENDING (one credit per session) when application + sessions are complete", async () => {
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
});
