import { describe, it, expect, vi, beforeEach } from "vitest";

/*
  SELECTIVE_INLINE per-session mini-wizard actions. Each session is an inline
  EventSession row (courseId null); its full application lives in
  event_sessions.course_info, its one MC question in event_sessions.question.
  The actions never touch course_applications.
*/

const { getCurrentUser, prismaMock, txMock, redirectMock } = vi.hoisted(() => {
  const txMock = {
    eventSession: {
      findFirst: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    event: { update: vi.fn() },
  };
  return {
    getCurrentUser: vi.fn(),
    txMock,
    prismaMock: {
      event: { findFirst: vi.fn(), update: vi.fn() },
      eventSession: {
        findFirst: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        findMany: vi.fn(),
      },
      $transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
    },
    redirectMock: vi.fn((url: string): never => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
  };
});

vi.mock("@/lib/auth/session", () => ({ getCurrentUser }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/forms/application/rich-text", () => ({
  sanitizeRichText: (html: string) => html,
  richTextPlainLength: (html: string) => html.replace(/<[^>]*>/g, "").length,
}));

import {
  addInlineSession,
  saveInlineSessionCourse,
  saveInlineSessionCreator,
  saveInlineSessionQuestion,
  removeInlineSession,
} from "@/lib/events/inline-session-actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const COURSE_FIELDS = {
  courseTitle: "Intro to Sedation",
  ceCreditHours: "1.5",
  subjectMatter: "Scientific",
  deliveryFormat: "LIVE In Person",
  primaryDistributionFormat: "Live/In Person",
  shortDescription: "A focused session on minimal sedation protocols for general practice.",
  publicProtectionStatement:
    "Participants learn monitoring standards that keep sedated patients safe.",
  courseObjectives: "1. Select candidates\n2. Monitor sedation\n3. Manage emergencies",
  courseOutline: "Part 1: candidate selection. Part 2: monitoring. Part 3: rescue.",
};

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "user-1", companyId: "company-1" });
});

describe("addInlineSession", () => {
  it("creates a DRAFT inline session at the next position and routes into its Course step", async () => {
    prismaMock.event.findFirst.mockResolvedValue({ id: "event-1", eventType: "SELECTIVE_INLINE" });
    prismaMock.eventSession.count.mockResolvedValue(2);
    prismaMock.eventSession.create.mockResolvedValue({ id: "sess-new" });

    await expect(addInlineSession(form({ eventId: "event-1" }))).rejects.toThrow(
      "NEXT_REDIRECT:/company/events/new/inline-sessions/sess-new/course",
    );
    expect(prismaMock.eventSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventId: "event-1", courseId: null, position: 2 }),
      }),
    );
  });

  it("refuses to add to a non-SELECTIVE_INLINE event", async () => {
    prismaMock.event.findFirst.mockResolvedValue({ id: "event-1", eventType: "FULL_EVENT_QUIZ" });
    await expect(addInlineSession(form({ eventId: "event-1" }))).rejects.toThrow(
      /selective event-only/,
    );
    expect(prismaMock.eventSession.create).not.toHaveBeenCalled();
  });
});

describe("saveInlineSessionCourse", () => {
  it("merges the course-info slice, mirrors name/durationHours, and recomputes the event total", async () => {
    prismaMock.eventSession.findFirst.mockResolvedValue({ courseInfo: {}, eventId: "event-1" });
    prismaMock.eventSession.findMany.mockResolvedValue([
      { durationHours: 1.5 },
      { durationHours: 2 },
    ]);

    await expect(
      saveInlineSessionCourse(form({ sessionId: "sess-1", ...COURSE_FIELDS })),
    ).rejects.toThrow("NEXT_REDIRECT:/company/events/new/inline-sessions/sess-1/creator");

    // Mirror update: name + durationHours from courseTitle/ceCreditHours.
    const mirror = prismaMock.eventSession.update.mock.calls.find(
      ([arg]) => (arg as { data?: { name?: string } }).data?.name !== undefined,
    );
    expect(mirror).toBeTruthy();
    expect((mirror![0] as { data: { name: string } }).data.name).toBe("Intro to Sedation");
    // Event total recomputed from the mirrored durations (1.5 + 2 = 3.5).
    expect(prismaMock.event.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "event-1" } }),
    );
    const total = prismaMock.event.update.mock.calls[0][0] as {
      data: { totalHours: { toString(): string } };
    };
    expect(Number(total.data.totalHours.toString())).toBe(3.5);
  });

  /*
    The echo. Before 2026-07-29 an invalid slice redirected without writing, so
    the step page re-rendered from the untouched (usually empty) draft and the
    provider lost the whole screen. Now the raw slice is persisted first, so the
    form comes back populated and the page re-derives the messages from it.
  */
  it("persists the raw slice on failure so nothing the provider typed is lost", async () => {
    prismaMock.eventSession.findFirst.mockResolvedValue({ courseInfo: {}, eventId: "event-1" });

    await expect(
      saveInlineSessionCourse(
        form({
          sessionId: "sess-1",
          ...COURSE_FIELDS,
          courseTitle: "x", // too short
        }),
      ),
    ).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/events\/new\/inline-sessions\/sess-1\/course\?error=validation/,
    );

    expect(prismaMock.eventSession.updateMany).toHaveBeenCalledTimes(1);
    const [arg] = prismaMock.eventSession.updateMany.mock.calls[0] as [
      { where: Record<string, unknown>; data: { courseInfo: Record<string, unknown> } },
    ];
    // The long fields the provider typed survive.
    expect(arg.data.courseInfo.courseObjectives).toBe(COURSE_FIELDS.courseObjectives);
    expect(arg.data.courseInfo.courseOutline).toBe(COURSE_FIELDS.courseOutline);
    expect(arg.data.courseInfo.courseTitle).toBe("x");
    // Scoped to this company's DRAFT event.
    expect(arg.where).toMatchObject({
      id: "sess-1",
      courseId: null,
      event: { companyId: "company-1", status: "DRAFT" },
    });
  });

  it("does not mirror name/durationHours or recompute hours on the echo path", async () => {
    prismaMock.eventSession.findFirst.mockResolvedValue({ courseInfo: {}, eventId: "event-1" });

    await expect(
      saveInlineSessionCourse(form({ sessionId: "sess-1", ...COURSE_FIELDS, courseTitle: "x" })),
    ).rejects.toThrow(/error=validation/);

    // Mirror columns keep their last good values; the session simply reads as
    // incomplete, which blocks Review until it is fixed.
    expect(prismaMock.eventSession.update).not.toHaveBeenCalled();
    expect(prismaMock.event.update).not.toHaveBeenCalled();
  });

  it("clamps an oversized paste and says so instead of truncating silently", async () => {
    prismaMock.eventSession.findFirst.mockResolvedValue({ courseInfo: {}, eventId: "event-1" });

    await expect(
      saveInlineSessionCourse(
        form({ sessionId: "sess-1", ...COURSE_FIELDS, courseOutline: "x".repeat(400_000) }),
      ),
    ).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/events\/new\/inline-sessions\/sess-1\/course\?error=too_long/,
    );
    const [arg] = prismaMock.eventSession.updateMany.mock.calls[0] as [
      { data: { courseInfo: { courseOutline: string } } },
    ];
    expect(arg.data.courseInfo.courseOutline.length).toBe(25_000);
  });
});

describe("saveInlineSessionCreator", () => {
  // The visible-text floor moved from an ad-hoc pre-check into step2WriteSchema
  // precisely so it goes through the merge helper and echoes, instead of
  // redirecting early and blanking all 13 creator fields.
  it("echoes every creator field when the detailed bio is too short", async () => {
    prismaMock.eventSession.findFirst.mockResolvedValue({ courseInfo: {}, eventId: "event-1" });

    await expect(
      saveInlineSessionCreator(
        form({
          sessionId: "sess-1",
          creatorName: "Dr. Jane Doe",
          credentials: "DDS",
          currentPosition: "Program Director",
          detailedBioHtml: "<p>short</p>",
          creatorEmail: "jane@example.com",
          creatorPhone: "555-123-4567",
          creatorAddress: "Austin, TX 78701",
          highestDegree: "Doctoral",
          educationPart1: "UT Austin, DDS, 2001",
          creatorExperience: "20 years placing implants in private practice.",
        }),
      ),
    ).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/events\/new\/inline-sessions\/sess-1\/creator\?error=validation/,
    );

    const [arg] = prismaMock.eventSession.updateMany.mock.calls[0] as [
      { data: { courseInfo: Record<string, unknown> } },
    ];
    expect(arg.data.courseInfo.creatorName).toBe("Dr. Jane Doe");
    expect(arg.data.courseInfo.creatorExperience).toBe(
      "20 years placing implants in private practice.",
    );
    expect(arg.data.courseInfo.detailedBioHtml).toBe("<p>short</p>");
  });
});

describe("removeInlineSession", () => {
  it("deletes the session, repacks positions, and recomputes the event total", async () => {
    txMock.eventSession.findFirst.mockResolvedValue({ id: "sess-2" });
    txMock.eventSession.findMany.mockResolvedValue([
      { id: "sess-1", durationHours: 1.5 },
      { id: "sess-3", durationHours: 2 },
    ]);

    await expect(
      removeInlineSession(form({ eventId: "event-1", sessionId: "sess-2" })),
    ).rejects.toThrow("NEXT_REDIRECT:/company/events/new/sessions");

    expect(txMock.eventSession.delete).toHaveBeenCalledWith({ where: { id: "sess-2" } });
    // Positions repacked to 0..n-1 in order.
    expect(txMock.eventSession.update).toHaveBeenCalledWith({
      where: { id: "sess-1" },
      data: { position: 0 },
    });
    expect(txMock.eventSession.update).toHaveBeenCalledWith({
      where: { id: "sess-3" },
      data: { position: 1 },
    });
    expect(txMock.event.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "event-1" } }),
    );
  });
});

describe("saveInlineSessionQuestion", () => {
  const CODE_FIELDS = {
    sessionId: "sess-1",
    questionType: "CODE",
    question: "Enter the attendance code announced during this session.",
    code: "  ROOM-A1 ",
  };

  function owned(attendanceCodesEnabled: boolean) {
    prismaMock.eventSession.findFirst.mockResolvedValue({
      eventId: "event-1",
      event: { company: { attendanceCodesEnabled } },
    });
    prismaMock.eventSession.updateMany.mockResolvedValue({ count: 1 });
  }

  it("saves a valid MC question and returns to the sessions list", async () => {
    owned(false);
    await expect(
      saveInlineSessionQuestion(
        form({
          sessionId: "sess-1",
          question: "What did the session cover?",
          option_0: "A",
          option_1: "B",
          option_2: "C",
          option_3: "D",
          correctIndex: "2",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/company/events/new/sessions?eventId=event-1");
    const data = prismaMock.eventSession.updateMany.mock.calls[0][0].data;
    expect(data.question).toMatchObject({ type: "MC", correctIndex: 2 });
    // MC never reads the sibling sessions.
    expect(prismaMock.eventSession.findMany).not.toHaveBeenCalled();
  });

  it("saves a trimmed attendance code when the company has codes on", async () => {
    owned(true);
    prismaMock.eventSession.findMany.mockResolvedValue([
      { id: "sess-2", question: { type: "CODE", question: "Enter the code here.", code: "ROOM-B2" } },
    ]);
    await expect(saveInlineSessionQuestion(form(CODE_FIELDS))).rejects.toThrow(
      "NEXT_REDIRECT:/company/events/new/sessions?eventId=event-1",
    );
    // Siblings are the same event's OTHER inline sessions.
    expect(prismaMock.eventSession.findMany.mock.calls[0][0].where).toEqual({
      eventId: "event-1",
      courseId: null,
      id: { not: "sess-1" },
    });
    const data = prismaMock.eventSession.updateMany.mock.calls[0][0].data;
    expect(data.question).toEqual({
      type: "CODE",
      question: "Enter the attendance code announced during this session.",
      code: "ROOM-A1",
    });
  });

  it("refuses a code when the feature is off, echoing what was typed", async () => {
    owned(false);
    await expect(saveInlineSessionQuestion(form(CODE_FIELDS))).rejects.toThrow(
      "NEXT_REDIRECT:/company/events/new/inline-sessions/sess-1/question?error=codes_disabled&type=CODE",
    );
    const data = prismaMock.eventSession.updateMany.mock.calls[0][0].data;
    expect(data.question).toMatchObject({ type: "CODE", code: "ROOM-A1" });
  });

  it("rejects a code another session in the event already uses (after normalising)", async () => {
    owned(true);
    prismaMock.eventSession.findMany.mockResolvedValue([
      { id: "sess-2", question: { type: "CODE", question: "Enter the code here.", code: " room-a1" } },
    ]);
    await expect(saveInlineSessionQuestion(form(CODE_FIELDS))).rejects.toThrow(
      "NEXT_REDIRECT:/company/events/new/inline-sessions/sess-1/question?error=validation&type=CODE",
    );
    const data = prismaMock.eventSession.updateMany.mock.calls[0][0].data;
    expect(data.question).toMatchObject({ type: "CODE", code: "ROOM-A1" });
  });

  it("echoes an invalid code back instead of blanking the form", async () => {
    owned(true);
    await expect(saveInlineSessionQuestion(form({ ...CODE_FIELDS, code: "a b" }))).rejects.toThrow(
      "NEXT_REDIRECT:/company/events/new/inline-sessions/sess-1/question?error=validation&type=CODE",
    );
    const data = prismaMock.eventSession.updateMany.mock.calls[0][0].data;
    expect(data.question).toMatchObject({ type: "CODE", code: "a b" });
    expect(prismaMock.eventSession.findMany).not.toHaveBeenCalled();
  });

  it("throws when the session is not the caller's DRAFT inline session", async () => {
    prismaMock.eventSession.findFirst.mockResolvedValue(null);
    await expect(saveInlineSessionQuestion(form(CODE_FIELDS))).rejects.toThrow("Session not found");
    expect(prismaMock.eventSession.updateMany).not.toHaveBeenCalled();
  });
});
