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

  it("redirects back with a validation error when the slice is incomplete", async () => {
    await expect(
      saveInlineSessionCourse(form({ sessionId: "sess-1", courseTitle: "x" })),
    ).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/events\/new\/inline-sessions\/sess-1\/course\?error=validation/,
    );
    expect(prismaMock.eventSession.update).not.toHaveBeenCalled();
  });
});

describe("saveInlineSessionCreator", () => {
  it("rejects a too-short detailed bio before persisting", async () => {
    await expect(
      saveInlineSessionCreator(form({ sessionId: "sess-1", detailedBioHtml: "<p>short</p>" })),
    ).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/events\/new\/inline-sessions\/sess-1\/creator\?error=validation/,
    );
    expect(prismaMock.eventSession.findFirst).not.toHaveBeenCalled();
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
