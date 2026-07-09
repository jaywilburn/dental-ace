import { describe, it, expect, vi, beforeEach } from "vitest";

/*
  Recipient + hardening tests for submitEventAttendance (multi-session event
  path). Mirrors actions.test.ts: the post-commit block must always email the
  RAW entered address (casing preserved) and must still send even when the event
  PDF render fails. Quiz assembly + prior-attempt lookup are stubbed; scoring
  runs for real against a one-question assembled quiz that the passing answer
  clears.
*/

const {
  sendEmail,
  renderEventCertificatePdf,
  uploadToStorage,
  signCertClaimToken,
  loadEventByToken,
  assembleForSubmit,
  prismaMock,
} = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  renderEventCertificatePdf: vi.fn(),
  uploadToStorage: vi.fn(),
  signCertClaimToken: vi.fn(() => "signed-token"),
  loadEventByToken: vi.fn(),
  assembleForSubmit: vi.fn(),
  prismaMock: {
    issuedCertificate: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/email/send", () => ({ sendEmail }));
vi.mock("@/lib/pdf/event-certificate", () => ({ renderEventCertificatePdf }));
vi.mock("@/lib/storage", () => ({ uploadToStorage }));
vi.mock("@/lib/protrack/cert-claim-token", () => ({ signCertClaimToken }));
vi.mock("@/lib/attend/event-quiz", () => ({ loadEventByToken, assembleForSubmit }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: () => "127.0.0.1" })),
}));

import { submitEventAttendance } from "@/lib/attend/event-actions";

// One MC question; the passing answer selects the correct index (0.7 * 1 -> 1/1).
const ASSEMBLED = {
  questions: [
    { type: "MC", question: "Session A key point?", options: ["A", "B", "C", "D"], correctIndex: 0 },
  ],
  hours: 2,
  attendedSessionIds: [],
  sessionNames: ["Session A"],
  passPct: 0.7,
};

function recentDate(): string {
  return new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
}

const ENTERED_EMAIL = "John@CEExchange.io";

function buildInput(overrides: Record<string, unknown> = {}) {
  return {
    token: "22222222-2222-2222-2222-222222222222",
    attendeeName: "John Doe",
    attendeeEmail: ENTERED_EMAIL,
    licenseNumber: "TX-RDH-1",
    licenseType: "RDH",
    licenseStates: ["TX"],
    completionDate: recentDate(),
    selectedSessionIds: [],
    affirmed: true,
    answers: [{ type: "MC", answer: 0 }],
    ...overrides,
  };
}

function mockEvent() {
  loadEventByToken.mockResolvedValue({
    id: "event-1",
    companyId: "company-1",
    name: "Big Live Event",
    eventIdNumber: "ACE-EVT-1",
    status: "APPROVED",
    expiresAt: new Date(Date.now() + 864e5),
    company: { certBalance: 10 },
  });
  assembleForSubmit.mockReturnValue(ASSEMBLED);
}

describe("submitEventAttendance — certificate email recipient + hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.issuedCertificate.findMany.mockResolvedValue([]);
    prismaMock.issuedCertificate.update.mockResolvedValue({});
    prismaMock.$transaction.mockResolvedValue("cert-evt-123");
    renderEventCertificatePdf.mockResolvedValue(Buffer.from("EVT-PDF-BYTES"));
    uploadToStorage.mockResolvedValue({ storagePath: "cert-evt-123.pdf" });
    sendEmail.mockResolvedValue(undefined);
    signCertClaimToken.mockReturnValue("signed-token");
    mockEvent();
  });

  it("emails the exact entered address (casing preserved) with the PDF attached", async () => {
    const result = await submitEventAttendance(buildInput());

    expect(result).toEqual({ status: "passed", certificateId: "cert-evt-123" });
    expect(sendEmail).toHaveBeenCalledTimes(1);

    const arg = sendEmail.mock.calls[0][0];
    expect(arg.to).toBe(ENTERED_EMAIL);
    expect(arg.to).not.toBe(ENTERED_EMAIL.toLowerCase());
    expect(arg.attachments).toHaveLength(1);
    expect(arg.attachments[0].content).toEqual(Buffer.from("EVT-PDF-BYTES"));
    expect(arg.attachments[0].filename).toBe("ACE-EVT-1-certificate.pdf");
  });

  it("still sends the email (no attachment) when the PDF render fails", async () => {
    renderEventCertificatePdf.mockRejectedValueOnce(new Error("render boom"));

    const result = await submitEventAttendance(buildInput());

    expect(result).toEqual({ status: "passed", certificateId: "cert-evt-123" });
    expect(sendEmail).toHaveBeenCalledTimes(1);

    const arg = sendEmail.mock.calls[0][0];
    expect(arg.to).toBe(ENTERED_EMAIL);
    expect(arg.attachments).toBeUndefined();
    expect(uploadToStorage).not.toHaveBeenCalled();
    expect(prismaMock.issuedCertificate.update).not.toHaveBeenCalled();
  });
});
