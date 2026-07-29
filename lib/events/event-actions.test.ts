import { describe, it, expect, vi, beforeEach } from "vitest";

/*
  submitEvent completeness gate for SELECTIVE_INLINE events. Each session now
  carries its OWN full application (Course Info + Creator + Presenters) plus one
  MC question, all on event_sessions; there is no event-level application. The
  event flips DRAFT -> PENDING only when at least one session exists and every
  session's full application + question validate. Crucially the flow creates NO
  CourseApplication rows (approveEvent keys the lightweight-vs-full-course model
  on pending session applications existing), and bills ONE credit for the whole
  event no matter how many sessions it lists (eventCreditCost).
*/

const { getCurrentUser, prismaMock, txMock, redirectMock, sendEmail } = vi.hoisted(() => {
  const txMock = {
    $executeRaw: vi.fn(),
    company: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    courseApplication: {
      deleteMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    event: { updateMany: vi.fn() },
  };
  return {
    getCurrentUser: vi.fn(),
    txMock,
    prismaMock: {
      event: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
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

import { submitEvent, ensureEventDraft } from "@/lib/events/event-actions";

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
    // Full org slice: submitEvent gates the details step with a strict
    // orgStepSchema.merge(eventDetailsSchema) parse, not a presence check,
    // because drafts now save tolerantly (mergeEventStep echoes invalid input
    // back so the provider does not lose the screen).
    eventData: {
      organizationName: "Texas Dental Association",
      organizationAddress: "1946 S IH-35, Austin, TX 78704",
      adminName: "Pat Admin",
      adminEmail: "admin@example.com",
      adminPhone: "555-987-6543",
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

  it("moves the event to PENDING for one credit when every session is complete", async () => {
    prismaMock.event.findFirst.mockResolvedValue(draftEvent());
    await expect(submitEvent(submitForm())).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/events\?just=submitted/,
    );
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.company.update).toHaveBeenCalledWith({
      where: { id: "company-1" },
      data: { applicationCredits: { decrement: 1 } },
    });
    expect(txMock.event.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "event-1", companyId: "company-1", status: "DRAFT" },
        data: expect.objectContaining({ status: "PENDING" }),
      }),
    );
  });

  it("charges exactly one credit no matter how many sessions", async () => {
    // 8 sessions, mirroring the Smile Together event that was billed 8 credits
    // for a single Event ID before 2026-07-29.
    const sessions = Array.from({ length: 8 }, (_, i) => ({
      id: `s${i}`,
      courseId: null,
      name: `Session ${i}`,
      durationHours: 1,
      question: MC_QUESTION,
      courseInfo: sessionInfo(`Session ${i}`, 1),
    }));
    prismaMock.event.findFirst.mockResolvedValue(draftEvent({ sessions }));
    await expect(submitEvent(submitForm())).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/events\?just=submitted/,
    );
    expect(txMock.company.update).toHaveBeenCalledWith({
      where: { id: "company-1" },
      data: { applicationCredits: { decrement: 1 } },
    });
  });

  it("submits an 8-session event on a balance of exactly 1 credit", async () => {
    const sessions = Array.from({ length: 8 }, (_, i) => ({
      id: `s${i}`,
      courseId: null,
      name: `Session ${i}`,
      durationHours: 1,
      question: MC_QUESTION,
      courseInfo: sessionInfo(`Session ${i}`, 1),
    }));
    prismaMock.company.findUnique.mockResolvedValue({ applicationCredits: 1 });
    txMock.company.findUniqueOrThrow.mockResolvedValue({ applicationCredits: 1 });
    prismaMock.event.findFirst.mockResolvedValue(draftEvent({ sessions }));
    await expect(submitEvent(submitForm())).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/events\?just=submitted/,
    );
    expect(txMock.company.update).toHaveBeenCalledWith({
      where: { id: "company-1" },
      data: { applicationCredits: { decrement: 1 } },
    });
  });

  it("redirects to review with error=credits on a zero balance, charging nothing", async () => {
    prismaMock.company.findUnique.mockResolvedValue({ applicationCredits: 0 });
    prismaMock.event.findFirst.mockResolvedValue(draftEvent());
    await expect(submitEvent(submitForm())).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/events\/new\/review\?error=credits/,
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("creates NO CourseApplication rows (keeps the lightweight-inline model discriminator)", async () => {
    prismaMock.event.findFirst.mockResolvedValue(draftEvent());
    await expect(submitEvent(submitForm())).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/events\?just=submitted/,
    );
    expect(txMock.courseApplication.create).not.toHaveBeenCalled();
  });
});

/*
  FULL_EVENT_QUIZ (Opt 1) shares the event-only billing rule: every session is a
  real CourseApplication row that flips DRAFT -> PENDING, but the EVENT is still
  accredited as one application and costs one credit.
*/
describe("submitEvent — FULL_EVENT_QUIZ billing", () => {
  // Unlike the inline model, a FULL_EVENT_QUIZ session application is gated by
  // eventSessionApplicationSchema, which merges orgStepSchema (the sub-wizard
  // seeds org/contact from the event at creation).
  const ORG_SLICE = {
    organizationName: "Texas Dental Association",
    organizationAddress: "1946 S IH-35, Austin, TX 78704",
    adminName: "Pat Admin",
    adminEmail: "admin@example.com",
    adminPhone: "555-987-6543",
  };

  function fullQuizEvent(sessionCount: number) {
    return draftEvent({
      eventType: "FULL_EVENT_QUIZ",
      sessions: [],
      sessionApplications: Array.from({ length: sessionCount }, (_, i) => ({
        id: `app-${i}`,
        applicationData: {
          ...ORG_SLICE,
          ...sessionInfo(`Session ${i}`, 2),
          quiz: [MC_QUESTION],
        },
      })),
    });
  }

  beforeEach(() => {
    txMock.courseApplication.updateMany.mockResolvedValue({ count: 1 });
  });

  it("charges one credit for a 3-session event and flips every session", async () => {
    prismaMock.event.findFirst.mockResolvedValue(fullQuizEvent(3));
    await expect(submitEvent(submitForm())).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/events\?just=submitted/,
    );
    expect(txMock.company.update).toHaveBeenCalledWith({
      where: { id: "company-1" },
      data: { applicationCredits: { decrement: 1 } },
    });
    expect(txMock.courseApplication.updateMany).toHaveBeenCalledTimes(3);
  });

  it("submits a 3-session event on a balance of exactly 1 credit", async () => {
    prismaMock.company.findUnique.mockResolvedValue({ applicationCredits: 1 });
    txMock.company.findUniqueOrThrow.mockResolvedValue({ applicationCredits: 1 });
    prismaMock.event.findFirst.mockResolvedValue(fullQuizEvent(3));
    await expect(submitEvent(submitForm())).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/events\?just=submitted/,
    );
    expect(txMock.company.update).toHaveBeenCalledWith({
      where: { id: "company-1" },
      data: { applicationCredits: { decrement: 1 } },
    });
  });

  it("redirects to review with error=credits on a zero balance", async () => {
    prismaMock.company.findUnique.mockResolvedValue({ applicationCredits: 0 });
    prismaMock.event.findFirst.mockResolvedValue(fullQuizEvent(3));
    await expect(submitEvent(submitForm())).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/events\/new\/review\?error=credits/,
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

/*
  Revising after a review decision is free (client decision 2026-07-29).
  creditChargedAt is the gate: submit charges iff it is null and stamps it in
  the same transaction as the decrement, so a revision cannot be charged twice.
*/
describe("submitEvent — free revision", () => {
  it("charges nothing when the credit is already settled", async () => {
    prismaMock.event.findFirst.mockResolvedValue(
      draftEvent({ creditChargedAt: new Date("2026-07-28T21:23:38Z") }),
    );
    await expect(submitEvent(submitForm())).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/events\?just=submitted/,
    );
    expect(txMock.company.update).not.toHaveBeenCalled();
  });

  it("still moves a revision to PENDING", async () => {
    prismaMock.event.findFirst.mockResolvedValue(
      draftEvent({ creditChargedAt: new Date("2026-07-28T21:23:38Z") }),
    );
    await expect(submitEvent(submitForm())).rejects.toThrow(/just=submitted/);
    expect(txMock.event.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PENDING" }) }),
    );
  });

  it("lets a revision through on a ZERO balance", async () => {
    // The whole point: a provider who spent their last credit on the original
    // submission must be able to resubmit without buying another.
    prismaMock.company.findUnique.mockResolvedValue({ applicationCredits: 0 });
    txMock.company.findUniqueOrThrow.mockResolvedValue({ applicationCredits: 0 });
    prismaMock.event.findFirst.mockResolvedValue(
      draftEvent({ creditChargedAt: new Date("2026-07-28T21:23:38Z") }),
    );
    await expect(submitEvent(submitForm())).rejects.toThrow(/just=submitted/);
    expect(txMock.company.update).not.toHaveBeenCalled();
  });

  it("charges and stamps a first submission", async () => {
    prismaMock.event.findFirst.mockResolvedValue(draftEvent({ creditChargedAt: null }));
    await expect(submitEvent(submitForm())).rejects.toThrow(/just=submitted/);
    expect(txMock.company.update).toHaveBeenCalledWith({
      where: { id: "company-1" },
      data: { applicationCredits: { decrement: 1 } },
    });
    const [arg] = txMock.event.updateMany.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(arg.data.creditChargedAt).toBeInstanceOf(Date);
  });
});

/*
  ensureEventDraft. The submittedAt: null scope on the implicit branch is the
  anti-gaming guard: a revision is a DRAFT whose credit is already settled, so
  if "+ New Event" could resume one, a provider could build an entirely
  different event on a paid row and submit it for nothing.
*/
describe("ensureEventDraft", () => {
  beforeEach(() => {
    prismaMock.event.create.mockResolvedValue({ id: "new-draft" });
  });

  it("NEVER implicitly resumes a draft that has been submitted before", async () => {
    // The guard under test. If this filter is ever dropped, a settled row
    // becomes reusable as a free new submission.
    prismaMock.event.findMany.mockResolvedValue([]);
    await ensureEventDraft();
    const [arg] = prismaMock.event.findMany.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(arg.where).toMatchObject({
      companyId: "company-1",
      status: "DRAFT",
      submittedAt: null,
    });
  });

  it("creates a fresh draft when the company has none in progress", async () => {
    prismaMock.event.findMany.mockResolvedValue([]);
    await expect(ensureEventDraft()).resolves.toBe("new-draft");
  });

  it("resumes the single in-progress draft", async () => {
    prismaMock.event.findMany.mockResolvedValue([{ id: "ev-existing" }]);
    await expect(ensureEventDraft()).resolves.toBe("ev-existing");
    expect(prismaMock.event.create).not.toHaveBeenCalled();
  });

  it("asks which one rather than silently opening the wrong draft", async () => {
    prismaMock.event.findMany.mockResolvedValue([{ id: "ev-a" }, { id: "ev-b" }]);
    await expect(ensureEventDraft()).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/events\?error=multiple_drafts/,
    );
    expect(prismaMock.event.create).not.toHaveBeenCalled();
  });

  it("opens an explicit id, which is the ONLY way to reach a revision", async () => {
    prismaMock.event.findFirst.mockResolvedValue({ id: "ev-revised" });
    await expect(ensureEventDraft("ev-revised")).resolves.toBe("ev-revised");
    // Explicit lookup must still be company- and DRAFT-scoped.
    const [arg] = prismaMock.event.findFirst.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(arg.where).toMatchObject({
      id: "ev-revised",
      companyId: "company-1",
      status: "DRAFT",
    });
    expect(prismaMock.event.findMany).not.toHaveBeenCalled();
  });

  it("refuses an id belonging to another company", async () => {
    prismaMock.event.findFirst.mockResolvedValue(null);
    await expect(ensureEventDraft("someone-elses-event")).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/events\?error=draft_not_found/,
    );
    expect(prismaMock.event.create).not.toHaveBeenCalled();
  });
});
