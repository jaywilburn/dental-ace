import { describe, it, expect, vi, beforeEach } from "vitest";

/*
  Staff reversal of a rejection. The status flip and the audit row must commit
  together: an un-audited status reversal is exactly what that log exists to
  prevent.
*/

const { getCurrentUser, prismaMock, txMock, redirectMock, recordAdminAction, sendEmail } =
  vi.hoisted(() => {
    const txMock = {
      event: { updateMany: vi.fn() },
      courseApplication: { updateMany: vi.fn() },
    };
    return {
      getCurrentUser: vi.fn(),
      txMock,
      prismaMock: {
        event: { findUnique: vi.fn() },
        courseApplication: { findUnique: vi.fn() },
        $transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
      },
      redirectMock: vi.fn((url: string): never => {
        throw new Error(`NEXT_REDIRECT:${url}`);
      }),
      recordAdminAction: vi.fn(),
      sendEmail: vi.fn(),
    };
  });

vi.mock("@/lib/auth/session", () => ({ getCurrentUser }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/audit", () => ({ recordAdminAction }));
vi.mock("@/lib/email/send", () => ({ sendEmail }));
vi.mock("@/lib/app-url", () => ({ appBaseUrl: () => "https://www.dentalace.org" }));
vi.mock("@/emails/review-reopened", () => ({
  default: Object.assign(vi.fn(() => null), { subject: vi.fn(() => "Back Under Review") }),
}));

import { reopenEvent } from "@/lib/reviewer/reopen-actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const REASON = "Rejected in error; the application was complete but collapsed.";

function rejectedEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "ev-1",
    name: "Smile Together",
    status: "REJECTED",
    reviewedAt: new Date("2026-07-29T11:53:57Z"),
    reviewedById: "reviewer-9",
    reviewerNotes: "Where is the information about the company?",
    company: { name: "Smile Together", users: [{ email: "provider@example.com" }] },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "reviewer-1", staffRole: "REVIEWER" });
  txMock.event.updateMany.mockResolvedValue({ count: 1 });
});

describe("reopenEvent", () => {
  it("returns the event to the queue and clears the reversed attribution", async () => {
    prismaMock.event.findUnique.mockResolvedValue(rejectedEvent());
    await expect(reopenEvent(form({ eventId: "ev-1", reason: REASON }))).rejects.toThrow(
      /NEXT_REDIRECT:\/reviewer\/events\/ev-1\?ok=reopened/,
    );
    const [arg] = txMock.event.updateMany.mock.calls[0] as [
      { where: Record<string, unknown>; data: Record<string, unknown> },
    ];
    expect(arg.where).toMatchObject({ id: "ev-1", status: "REJECTED" });
    expect(arg.data).toEqual({ status: "PENDING", reviewedAt: null, reviewedById: null });
  });

  it("writes the audit row inside the SAME transaction as the flip", async () => {
    prismaMock.event.findUnique.mockResolvedValue(rejectedEvent());
    await expect(reopenEvent(form({ eventId: "ev-1", reason: REASON }))).rejects.toThrow(
      /NEXT_REDIRECT/,
    );
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    // The tx client, not the global prisma, is what makes it atomic.
    expect(recordAdminAction).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({
        actorUserId: "reviewer-1",
        action: "REVIEW_REOPENED",
        targetUserId: null,
      }),
    );
  });

  it("snapshots the decision it reversed, since decisions are not otherwise audited", async () => {
    prismaMock.event.findUnique.mockResolvedValue(rejectedEvent());
    await expect(reopenEvent(form({ eventId: "ev-1", reason: REASON }))).rejects.toThrow(
      /NEXT_REDIRECT/,
    );
    const [, input] = recordAdminAction.mock.calls[0] as [
      unknown,
      { details: Record<string, unknown> },
    ];
    expect(input.details).toMatchObject({
      entity: "EVENT",
      id: "ev-1",
      previousStatus: "REJECTED",
      previousReviewedById: "reviewer-9",
      previousReviewerNotes: "Where is the information about the company?",
      reason: REASON,
    });
  });

  /*
    The load-bearing refusal. An approved event holds a unique Event ID, a
    rendered QR and letter, a LIVE attendee link and possibly issued
    certificates. Flipping it to PENDING kills /attend mid-event and
    re-approval would allocate a second Event ID.
  */
  it("refuses to reopen an APPROVED event", async () => {
    prismaMock.event.findUnique.mockResolvedValue(rejectedEvent({ status: "APPROVED" }));
    await expect(reopenEvent(form({ eventId: "ev-1", reason: REASON }))).rejects.toThrow(
      /Only REJECTED events can be reopened/,
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("refuses an event still under review", async () => {
    prismaMock.event.findUnique.mockResolvedValue(rejectedEvent({ status: "PENDING" }));
    await expect(reopenEvent(form({ eventId: "ev-1", reason: REASON }))).rejects.toThrow(
      /Only REJECTED events can be reopened/,
    );
  });

  it("requires a real reason before touching anything", async () => {
    await expect(reopenEvent(form({ eventId: "ev-1", reason: "oops" }))).rejects.toThrow(
      /NEXT_REDIRECT:\/reviewer\/events\/ev-1\?error=reason_required/,
    );
    expect(prismaMock.event.findUnique).not.toHaveBeenCalled();
  });

  it("notifies the provider without leaking the staff reason", async () => {
    prismaMock.event.findUnique.mockResolvedValue(rejectedEvent());
    await expect(reopenEvent(form({ eventId: "ev-1", reason: REASON }))).rejects.toThrow(
      /NEXT_REDIRECT/,
    );
    const [arg] = sendEmail.mock.calls[0] as [{ to: string; react: unknown }];
    expect(arg.to).toBe("provider@example.com");
    expect(JSON.stringify(sendEmail.mock.calls)).not.toContain(REASON);
  });

  it("does not fail the reopen when the email fails", async () => {
    prismaMock.event.findUnique.mockResolvedValue(rejectedEvent());
    sendEmail.mockRejectedValueOnce(new Error("resend down"));
    // Still redirects, i.e. the status flip stands.
    await expect(reopenEvent(form({ eventId: "ev-1", reason: REASON }))).rejects.toThrow(
      /NEXT_REDIRECT:\/reviewer\/events\/ev-1\?ok=reopened/,
    );
  });

  it("aborts if the decision changed underneath it", async () => {
    prismaMock.event.findUnique.mockResolvedValue(rejectedEvent());
    txMock.event.updateMany.mockResolvedValue({ count: 0 });
    await expect(reopenEvent(form({ eventId: "ev-1", reason: REASON }))).rejects.toThrow(
      "Event decision changed during reopen",
    );
  });

  it("turns away a non-staff caller", async () => {
    getCurrentUser.mockResolvedValue({ id: "u", staffRole: "NONE" });
    await expect(reopenEvent(form({ eventId: "ev-1", reason: REASON }))).rejects.toThrow(
      /NEXT_REDIRECT:\/login/,
    );
  });
});
