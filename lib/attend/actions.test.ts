import { describe, it, expect, vi, beforeEach } from "vitest";

/*
  Recipient + hardening tests for submitAttendance (single-course path).

  Focus: the post-commit delivery block must (a) always email the RAW entered
  address (casing preserved, never the lowercased DB copy), and (b) still send
  the certificate email even when the PDF render fails, so a render/storage
  failure can never silently suppress delivery. The heavy deps (PDF render,
  storage, email, prisma, claim-token signer, next/headers) are stubbed so the
  test exercises the action's control flow, not the infrastructure.
*/

const { sendEmail, renderCertificatePdf, uploadToStorage, signCertClaimToken, prismaMock } =
  vi.hoisted(() => ({
    sendEmail: vi.fn(),
    renderCertificatePdf: vi.fn(),
    uploadToStorage: vi.fn(),
    signCertClaimToken: vi.fn(() => "signed-token"),
    prismaMock: {
      accreditedCourse: { findUnique: vi.fn() },
      issuedCertificate: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
      $transaction: vi.fn(),
    },
  }));

vi.mock("@/lib/email/send", () => ({ sendEmail }));
vi.mock("@/lib/pdf/certificate", () => ({ renderCertificatePdf }));
vi.mock("@/lib/storage", () => ({ uploadToStorage }));
vi.mock("@/lib/protrack/cert-claim-token", () => ({ signCertClaimToken }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: () => "127.0.0.1" })),
}));

import { submitAttendance } from "@/lib/attend/actions";

// 2 TF + 3 MC — matches the length(5) attendee quiz; all answers below are correct.
const QUESTIONS = [
  { type: "TF", question: "The sky is blue.", correctAnswer: "True" },
  { type: "TF", question: "Water is wet.", correctAnswer: "True" },
  { type: "MC", question: "What is 2 + 2?", options: ["4", "3", "2", "1"], correctIndex: 0 },
  { type: "MC", question: "First letter of the alphabet?", options: ["A", "B", "C", "D"], correctIndex: 0 },
  { type: "MC", question: "Days in a week?", options: ["7", "6", "5", "4"], correctIndex: 0 },
];

const PASSING_ANSWERS = [
  { type: "TF", answer: "True" },
  { type: "TF", answer: "True" },
  { type: "MC", answer: 0 },
  { type: "MC", answer: 0 },
  { type: "MC", answer: 0 },
];

// A completion date guaranteed within the last-10-years / not-future window.
function recentDate(): string {
  return new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
}

// MIXED-CASE address — the entered value must survive verbatim to the email `to`.
const ENTERED_EMAIL = "John@CEExchange.io";

function buildInput(overrides: Record<string, unknown> = {}) {
  return {
    token: "11111111-1111-1111-1111-111111111111",
    attendeeName: "John Doe",
    attendeeEmail: ENTERED_EMAIL,
    licenseNumber: "TX-RDH-1",
    licenseType: "RDH",
    licenseStates: ["TX"],
    completionDate: recentDate(),
    affirmed: true,
    answers: PASSING_ANSWERS,
    ...overrides,
  };
}

function mockCourse() {
  prismaMock.accreditedCourse.findUnique.mockResolvedValue({
    id: "course-1",
    companyId: "company-1",
    courseIdNumber: "ACE-1001",
    expiresAt: new Date(Date.now() + 864e5),
    quizQuestions: QUESTIONS,
    application: {
      courseTitle: "Infection Control",
      ceHours: 2,
      courseType: "Infection Control",
      deliveryMethod: "Online (self-study)",
    },
  });
}

describe("submitAttendance — certificate email recipient + hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.issuedCertificate.findMany.mockResolvedValue([]);
    prismaMock.issuedCertificate.update.mockResolvedValue({});
    prismaMock.$transaction.mockResolvedValue("cert-123");
    renderCertificatePdf.mockResolvedValue(Buffer.from("PDF-BYTES"));
    uploadToStorage.mockResolvedValue({ storagePath: "cert-123.pdf" });
    sendEmail.mockResolvedValue(undefined);
    signCertClaimToken.mockReturnValue("signed-token");
    mockCourse();
  });

  it("emails the exact entered address (casing preserved) with the PDF attached", async () => {
    const result = await submitAttendance(buildInput());

    expect(result).toEqual({ status: "passed", certificateId: "cert-123" });
    expect(sendEmail).toHaveBeenCalledTimes(1);

    const arg = sendEmail.mock.calls[0][0];
    // Casing preserved — NOT the lowercased DB copy.
    expect(arg.to).toBe(ENTERED_EMAIL);
    expect(arg.to).not.toBe(ENTERED_EMAIL.toLowerCase());
    expect(arg.attachments).toHaveLength(1);
    expect(arg.attachments[0].content).toEqual(Buffer.from("PDF-BYTES"));
    expect(arg.attachments[0].filename).toBe("ACE-1001-certificate.pdf");
  });

  it("still sends the email (no attachment) when the PDF render fails", async () => {
    renderCertificatePdf.mockRejectedValueOnce(new Error("render boom"));

    const result = await submitAttendance(buildInput());

    // The passing cert is unaffected; the action never throws.
    expect(result).toEqual({ status: "passed", certificateId: "cert-123" });
    // A render failure must NOT suppress the email.
    expect(sendEmail).toHaveBeenCalledTimes(1);

    const arg = sendEmail.mock.calls[0][0];
    expect(arg.to).toBe(ENTERED_EMAIL);
    // No bytes to attach when the render failed.
    expect(arg.attachments).toBeUndefined();
    // With no PDF we must not attempt to upload/persist a URL.
    expect(uploadToStorage).not.toHaveBeenCalled();
    expect(prismaMock.issuedCertificate.update).not.toHaveBeenCalled();
  });
});
