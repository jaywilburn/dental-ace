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

// All wrong — scores 0/5 and drives the fail branch.
const FAILING_ANSWERS = [
  { type: "TF", answer: "False" },
  { type: "TF", answer: "False" },
  { type: "MC", answer: 1 },
  { type: "MC", answer: 1 },
  { type: "MC", answer: 1 },
];

// The attendee's chosen Course Format. Deliberately DIFFERENT from the course's
// declared deliveryMethod ("Online (self-study)") so the assertions prove the
// attendee's pick — not the course default — is what lands on the certificate.
const CHOSEN_FORMAT = "On Demand Recording";

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
    courseFormat: CHOSEN_FORMAT,
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

  it("renders the certificate PDF with the attendee's chosen course format", async () => {
    await submitAttendance(buildInput());

    // The attendee's pick, not the course's declared deliveryMethod, drives the
    // "Course Format" line on the certificate.
    expect(renderCertificatePdf).toHaveBeenCalledTimes(1);
    expect(renderCertificatePdf.mock.calls[0][0].deliveryMethod).toBe(CHOSEN_FORMAT);
  });

  it("stamps the attendee's chosen course format on a failed attempt's cert row", async () => {
    const result = await submitAttendance(buildInput({ answers: FAILING_ANSWERS }));

    expect(result.status).toBe("failed");
    expect(prismaMock.issuedCertificate.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.issuedCertificate.create.mock.calls[0][0].data.deliveryMethod).toBe(
      CHOSEN_FORMAT,
    );
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

  it("returns per-field errors on invalid input without touching the DB or echoing values", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await submitAttendance(buildInput({ attendeeEmail: "not-an-email-value" }));

      expect(result.status).toBe("invalid");
      if (result.status !== "invalid") return;
      expect(result.fieldErrors.attendeeEmail?.length).toBeGreaterThan(0);
      // Static schema messages only — never the submitted value.
      expect(JSON.stringify(result.fieldErrors)).not.toContain("not-an-email-value");
      // Validation fails before any DB read or write.
      expect(prismaMock.accreditedCourse.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.issuedCertificate.create).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("falls back to the course's declared format when courseFormat is absent (stale client)", async () => {
    // Unique token: the unmocked in-memory rate limiter allows 5 per token.
    const result = await submitAttendance(
      buildInput({ courseFormat: undefined, token: "33333333-3333-3333-3333-333333333333" }),
    );

    expect(result).toEqual({ status: "passed", certificateId: "cert-123" });
    // The mocked course declares "Online (self-study)" (non-canonical), which
    // courseFormatLabel passes through trimmed.
    expect(renderCertificatePdf.mock.calls[0][0].deliveryMethod).toBe("Online (self-study)");
  });

  it("stores completedAt at noon UTC of the entered date", async () => {
    const input = buildInput({
      answers: FAILING_ANSWERS,
      token: "44444444-4444-4444-4444-444444444444",
    });
    await submitAttendance(input);

    expect(prismaMock.issuedCertificate.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.issuedCertificate.create.mock.calls[0][0].data.completedAt).toEqual(
      new Date(`${input.completionDate}T12:00:00Z`),
    );
  });
});
