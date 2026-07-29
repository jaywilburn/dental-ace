import { describe, it, expect, vi, beforeEach } from "vitest";

/*
  Provider-side revise and resubmit. Events revise in place; applications clone.
  Neither charges a credit (client decision 2026-07-29).
*/

const { getCurrentUser, prismaMock, txMock, redirectMock } = vi.hoisted(() => {
  const txMock = {
    event: { updateMany: vi.fn() },
    courseApplication: { updateMany: vi.fn() },
  };
  return {
    getCurrentUser: vi.fn(),
    txMock,
    prismaMock: {
      event: { findFirst: vi.fn() },
      courseApplication: { findFirst: vi.fn(), create: vi.fn() },
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

import { reviseEvent, resubmitApplication } from "@/lib/company/resubmit-actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "user-1", companyId: "company-1" });
  txMock.event.updateMany.mockResolvedValue({ count: 1 });
  txMock.courseApplication.updateMany.mockResolvedValue({ count: 0 });
});

describe("reviseEvent", () => {
  it("reopens a rejected event for editing and lands on review with its id", async () => {
    prismaMock.event.findFirst.mockResolvedValue({
      id: "ev-1",
      status: "REJECTED",
      eventType: "SELECTIVE_INLINE",
    });
    await expect(reviseEvent(form({ eventId: "ev-1" }))).rejects.toThrow(
      // Explicit id: a revision has submittedAt set, so ensureEventDraft will
      // not resume it implicitly.
      "NEXT_REDIRECT:/company/events/new/review?eventId=ev-1",
    );
    const [arg] = txMock.event.updateMany.mock.calls[0] as [
      { where: Record<string, unknown>; data: Record<string, unknown> },
    ];
    expect(arg.where).toMatchObject({ id: "ev-1", companyId: "company-1", status: "REJECTED" });
    expect(arg.data).toEqual({ status: "DRAFT", reviewedAt: null, reviewedById: null });
  });

  it("keeps reviewerNotes, submittedAt and creditChargedAt untouched", async () => {
    prismaMock.event.findFirst.mockResolvedValue({
      id: "ev-1",
      status: "REJECTED",
      eventType: "SELECTIVE_INLINE",
    });
    await expect(reviseEvent(form({ eventId: "ev-1" }))).rejects.toThrow(/NEXT_REDIRECT/);
    const [arg] = txMock.event.updateMany.mock.calls[0] as [{ data: Record<string, unknown> }];
    // Clearing creditChargedAt would re-charge the revision; clearing
    // submittedAt would make the paid row resumable as a free new submission.
    expect(arg.data).not.toHaveProperty("creditChargedAt");
    expect(arg.data).not.toHaveProperty("submittedAt");
    expect(arg.data).not.toHaveProperty("reviewerNotes");
  });

  /*
    The FULL_EVENT_QUIZ defect. rejectEvent only wrote the event row, leaving
    its session CourseApplications PENDING. submitEvent's full-course branch
    only flips DRAFT rows, so without this the resubmit threw
    "A session was already submitted".
  */
  it("also returns session applications to DRAFT so the resubmit can flip them", async () => {
    prismaMock.event.findFirst.mockResolvedValue({
      id: "ev-1",
      status: "REJECTED",
      eventType: "FULL_EVENT_QUIZ",
    });
    await expect(reviseEvent(form({ eventId: "ev-1" }))).rejects.toThrow(/NEXT_REDIRECT/);
    expect(txMock.courseApplication.updateMany).toHaveBeenCalledWith({
      where: { eventId: "ev-1", companyId: "company-1", status: "PENDING" },
      data: { status: "DRAFT", submittedAt: null },
    });
  });

  it("refuses an event that is not rejected", async () => {
    for (const status of ["PENDING", "APPROVED", "DRAFT"]) {
      vi.clearAllMocks();
      getCurrentUser.mockResolvedValue({ id: "user-1", companyId: "company-1" });
      prismaMock.event.findFirst.mockResolvedValue({ id: "ev-1", status, eventType: "SELECTIVE_INLINE" });
      await expect(reviseEvent(form({ eventId: "ev-1" }))).rejects.toThrow(
        /NEXT_REDIRECT:\/company\/events\?error=revise_not_allowed/,
      );
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    }
  });

  it("refuses another company's event", async () => {
    prismaMock.event.findFirst.mockResolvedValue(null);
    await expect(reviseEvent(form({ eventId: "ev-other" }))).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/events\?error=revise_not_found/,
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("aborts if the decision changed underneath it", async () => {
    prismaMock.event.findFirst.mockResolvedValue({
      id: "ev-1",
      status: "REJECTED",
      eventType: "SELECTIVE_INLINE",
    });
    txMock.event.updateMany.mockResolvedValue({ count: 0 });
    await expect(reviseEvent(form({ eventId: "ev-1" }))).rejects.toThrow(
      "Event status changed during revise",
    );
  });
});

describe("resubmitApplication", () => {
  const rejected = {
    id: "app-1",
    status: "REJECTED",
    applicationData: { courseTitle: "Implant Basics" },
    creditChargedAt: new Date("2026-07-28T21:23:38Z"),
    renewalOfCourseId: null,
  };

  it("clones the application carrying the settled credit, so the revision is free", async () => {
    prismaMock.courseApplication.findFirst
      .mockResolvedValueOnce(rejected)
      .mockResolvedValueOnce(null); // no revision in flight
    await expect(resubmitApplication(form({ applicationId: "app-1" }))).rejects.toThrow(
      "NEXT_REDIRECT:/company/applications/new/review",
    );
    const [arg] = prismaMock.courseApplication.create.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(arg.data).toMatchObject({
      companyId: "company-1",
      status: "DRAFT",
      resubmitOfId: "app-1",
      creditChargedAt: rejected.creditChargedAt,
    });
  });

  it("blocks a second revision while one is already in flight", async () => {
    prismaMock.courseApplication.findFirst
      .mockResolvedValueOnce(rejected)
      .mockResolvedValueOnce({ id: "app-2" });
    await expect(resubmitApplication(form({ applicationId: "app-1" }))).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/courses\?error=revise_in_progress/,
    );
    expect(prismaMock.courseApplication.create).not.toHaveBeenCalled();
  });

  it("refuses an application that is not rejected", async () => {
    prismaMock.courseApplication.findFirst.mockResolvedValueOnce({
      ...rejected,
      status: "APPROVED",
    });
    await expect(resubmitApplication(form({ applicationId: "app-1" }))).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/courses\?error=revise_not_allowed/,
    );
    expect(prismaMock.courseApplication.create).not.toHaveBeenCalled();
  });

  it("refuses another company's application", async () => {
    prismaMock.courseApplication.findFirst.mockResolvedValueOnce(null);
    await expect(resubmitApplication(form({ applicationId: "nope" }))).rejects.toThrow(
      /NEXT_REDIRECT:\/company\/courses\?error=revise_not_found/,
    );
  });
});
