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
// Loading + assembly are stubbed; activeSurvey stays REAL so the survey gate
// (company flag + stored definition) is exercised as shipped.
vi.mock("@/lib/attend/event-quiz", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/attend/event-quiz")>()),
  loadEventByToken,
  assembleForSubmit,
}));
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
  sessionHours: [],
  passPct: 0.7,
  perSessionCredit: false,
};

// Two-session SELECTIVE_INLINE assembly (per-session credit: each attended
// session's question is scored on its own; credited = attended AND correct).
// Session ids are UUIDs because eventAttendeeSubmissionSchema requires them.
const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const S3 = "33333333-3333-4333-8333-333333333333";
const ASSEMBLED_PER_SESSION = {
  questions: [
    { type: "MC", question: "Session A key point?", options: ["A", "B", "C", "D"], correctIndex: 0 },
    { type: "MC", question: "Session B key point?", options: ["A", "B", "C", "D"], correctIndex: 1 },
  ],
  hours: 3.5,
  attendedSessionIds: [S1, S2],
  sessionNames: ["Session A", "Session B"],
  sessionHours: [1.5, 2],
  passPct: 0.7,
  perSessionCredit: true,
};

function recentDate(): string {
  return new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
}

const ENTERED_EMAIL = "John@CEExchange.io";

// The attendee's chosen Course Format (not the event's live default), so the
// assertions prove the attendee's pick lands on the event certificate.
const CHOSEN_FORMAT = "On Demand Recording";

function buildInput(overrides: Record<string, unknown> = {}) {
  return {
    token: "22222222-2222-2222-2222-222222222222",
    attendeeName: "John Doe",
    attendeeEmail: ENTERED_EMAIL,
    licenseNumber: "TX-RDH-1",
    licenseType: "RDH",
    licenseStates: ["TX"],
    courseFormat: CHOSEN_FORMAT,
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

  it("rejects a non-approved event without issuing a certificate (assets stay gated until approval)", async () => {
    loadEventByToken.mockResolvedValueOnce({
      id: "event-1",
      companyId: "company-1",
      name: "Big Live Event",
      eventIdNumber: null,
      status: "PENDING",
      expiresAt: null,
      company: { certBalance: 10 },
    });

    const result = await submitEventAttendance(buildInput());

    expect(result).toEqual({ status: "event_inactive" });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("emails the exact entered address (casing preserved) with the PDF attached", async () => {
    const result = await submitEventAttendance(buildInput());

    expect(result).toEqual({ status: "passed", certificateId: "cert-evt-123", creditedSessionIds: [] });
    expect(sendEmail).toHaveBeenCalledTimes(1);

    const arg = sendEmail.mock.calls[0][0];
    expect(arg.to).toBe(ENTERED_EMAIL);
    expect(arg.to).not.toBe(ENTERED_EMAIL.toLowerCase());
    expect(arg.attachments).toHaveLength(1);
    expect(arg.attachments[0].content).toEqual(Buffer.from("EVT-PDF-BYTES"));
    expect(arg.attachments[0].filename).toBe("ACE-EVT-1-certificate.pdf");
  });

  it("renders the event certificate PDF with the attendee's chosen course format", async () => {
    await submitEventAttendance(buildInput());

    expect(renderEventCertificatePdf).toHaveBeenCalledTimes(1);
    expect(renderEventCertificatePdf.mock.calls[0][0].deliveryMethod).toBe(CHOSEN_FORMAT);
  });

  it("stamps the attendee's chosen course format on a failed attempt's cert row", async () => {
    // One wrong answer -> 0/1 -> below the 0.7 threshold -> fail branch.
    const result = await submitEventAttendance(buildInput({ answers: [{ type: "MC", answer: 1 }] }));

    expect(result.status).toBe("failed");
    expect(prismaMock.issuedCertificate.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.issuedCertificate.create.mock.calls[0][0].data.deliveryMethod).toBe(
      CHOSEN_FORMAT,
    );
  });

  it("still sends the email (no attachment) when the PDF render fails", async () => {
    renderEventCertificatePdf.mockRejectedValueOnce(new Error("render boom"));

    const result = await submitEventAttendance(buildInput());

    expect(result).toEqual({ status: "passed", certificateId: "cert-evt-123", creditedSessionIds: [] });
    expect(sendEmail).toHaveBeenCalledTimes(1);

    const arg = sendEmail.mock.calls[0][0];
    expect(arg.to).toBe(ENTERED_EMAIL);
    expect(arg.attachments).toBeUndefined();
    expect(uploadToStorage).not.toHaveBeenCalled();
    expect(prismaMock.issuedCertificate.update).not.toHaveBeenCalled();
  });

  it("returns per-field errors on invalid input without loading the event", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await submitEventAttendance(buildInput({ attendeeEmail: "nope" }));

      expect(result.status).toBe("invalid");
      if (result.status !== "invalid") return;
      expect(result.fieldErrors.attendeeEmail?.length).toBeGreaterThan(0);
      expect(loadEventByToken).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("falls back to LIVE In Person when courseFormat is absent (stale client)", async () => {
    // Unique token: the unmocked in-memory rate limiter allows 5 per token.
    const result = await submitEventAttendance(
      buildInput({ courseFormat: undefined, token: "55555555-5555-5555-5555-555555555555" }),
    );

    expect(result).toEqual({ status: "passed", certificateId: "cert-evt-123", creditedSessionIds: [] });
    expect(renderEventCertificatePdf.mock.calls[0][0].deliveryMethod).toBe("LIVE In Person");
  });

  it("returns an answers field error when answers do not match the assembled quiz", async () => {
    // Two assembled questions vs one submitted answer -> assembly mismatch.
    assembleForSubmit.mockReturnValue({
      ...ASSEMBLED,
      questions: [...ASSEMBLED.questions, ...ASSEMBLED.questions],
    });

    const result = await submitEventAttendance(
      buildInput({ token: "66666666-6666-6666-6666-666666666666" }),
    );

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") return;
    expect(result.fieldErrors.answers?.length).toBeGreaterThan(0);
  });
});

describe("submitEventAttendance — SELECTIVE_INLINE per-session credit", () => {
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
    assembleForSubmit.mockReturnValue(ASSEMBLED_PER_SESSION);
  });

  it("mixed answers: passes with only the credited session's hours and name on the cert", async () => {
    // Session A correct (index 0), Session B wrong -> only A is credited.
    const result = await submitEventAttendance(
      buildInput({
        token: "77777777-7777-7777-7777-777777777777",
        selectedSessionIds: [S1, S2],
        answers: [
          { type: "MC", answer: 0 },
          { type: "MC", answer: 3 },
        ],
      }),
    );

    expect(result).toEqual({ status: "passed", certificateId: "cert-evt-123", creditedSessionIds: [S1] });
    const pdfArgs = renderEventCertificatePdf.mock.calls[0][0];
    expect(pdfArgs.ceHours).toBe(1.5);
    expect(pdfArgs.sessions).toEqual(["Session A"]);
    expect(pdfArgs.sessionHours).toEqual([1.5]);
  });

  it("all wrong: fails with the existing fail UX and records the attended attempt", async () => {
    const result = await submitEventAttendance(
      buildInput({
        token: "88888888-8888-8888-8888-888888888888",
        selectedSessionIds: [S1, S2],
        answers: [
          { type: "MC", answer: 3 },
          { type: "MC", answer: 3 },
        ],
      }),
    );

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.canRetake).toBe(true);
    // The failed attempt row keeps the ATTENDED hours/sessions, never a cert.
    expect(prismaMock.issuedCertificate.create).toHaveBeenCalledTimes(1);
    const row = prismaMock.issuedCertificate.create.mock.calls[0][0].data;
    expect(row.passed).toBe(false);
    expect(row.ceHours).toBe(3.5);
    expect(row.attendedSessionIds).toEqual([S1, S2]);
    expect(renderEventCertificatePdf).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("1 of 3 correct: passes with partial hours where the 70% gate would fail", async () => {
    // round(0.7 * 3) = 2, so the overall gate would fail 1/3; per-session
    // credit instead drops the wrong sessions and certifies the correct one.
    assembleForSubmit.mockReturnValue({
      ...ASSEMBLED_PER_SESSION,
      questions: [
        ...ASSEMBLED_PER_SESSION.questions,
        { type: "MC", question: "Session C key point?", options: ["A", "B", "C", "D"], correctIndex: 2 },
      ],
      hours: 4,
      attendedSessionIds: [S1, S2, S3],
      sessionNames: ["Session A", "Session B", "Session C"],
      sessionHours: [1.5, 2, 0.5],
    });

    const result = await submitEventAttendance(
      buildInput({
        token: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        selectedSessionIds: [S1, S2, S3],
        answers: [
          { type: "MC", answer: 3 },
          { type: "MC", answer: 3 },
          { type: "MC", answer: 2 },
        ],
      }),
    );

    expect(result).toEqual({ status: "passed", certificateId: "cert-evt-123", creditedSessionIds: [S3] });
    const pdfArgs = renderEventCertificatePdf.mock.calls[0][0];
    expect(pdfArgs.ceHours).toBe(0.5);
    expect(pdfArgs.sessions).toEqual(["Session C"]);
    expect(pdfArgs.sessionHours).toEqual([0.5]);
  });

  it("all correct: passes with the full attended sum", async () => {
    const result = await submitEventAttendance(
      buildInput({
        token: "99999999-9999-9999-9999-999999999999",
        selectedSessionIds: [S1, S2],
        answers: [
          { type: "MC", answer: 0 },
          { type: "MC", answer: 1 },
        ],
      }),
    );

    expect(result).toEqual({ status: "passed", certificateId: "cert-evt-123", creditedSessionIds: [S1, S2] });
    const pdfArgs = renderEventCertificatePdf.mock.calls[0][0];
    expect(pdfArgs.ceHours).toBe(3.5);
    expect(pdfArgs.sessions).toEqual(["Session A", "Session B"]);
    expect(pdfArgs.sessionHours).toEqual([1.5, 2]);
  });
});

describe("submitEventAttendance — attendance codes (CODE sessions)", () => {
  // Session A asks an MC question, session B an attendance code. Scoring runs
  // for real: the typed code is matched with codesMatch (case and spaces
  // ignored), and only matching sessions are credited.
  const ASSEMBLED_CODES = {
    ...ASSEMBLED_PER_SESSION,
    questions: [
      ASSEMBLED_PER_SESSION.questions[0],
      { type: "CODE", question: "Enter the attendance code.", code: "AbC 12" },
    ],
  };

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
    assembleForSubmit.mockReturnValue(ASSEMBLED_CODES);
  });

  it("credits a session whose typed code matches after normalising", async () => {
    const result = await submitEventAttendance(
      buildInput({
        token: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        selectedSessionIds: [S1, S2],
        answers: [
          { type: "MC", answer: 0 },
          { type: "CODE", answer: " abc12 " },
        ],
      }),
    );
    expect(result).toEqual({ status: "passed", certificateId: "cert-evt-123", creditedSessionIds: [S1, S2] });
    expect(renderEventCertificatePdf.mock.calls[0][0].ceHours).toBe(3.5);
  });

  it("drops a session with a mistyped code and reports which sessions were credited", async () => {
    const result = await submitEventAttendance(
      buildInput({
        token: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        selectedSessionIds: [S1, S2],
        answers: [
          { type: "MC", answer: 0 },
          { type: "CODE", answer: "ABC13" },
        ],
      }),
    );
    expect(result).toEqual({ status: "passed", certificateId: "cert-evt-123", creditedSessionIds: [S1] });
    const pdfArgs = renderEventCertificatePdf.mock.calls[0][0];
    expect(pdfArgs.ceHours).toBe(1.5);
    expect(pdfArgs.sessions).toEqual(["Session A"]);
  });

  it("rejects an over-long code answer at the boundary without loading the event", async () => {
    const result = await submitEventAttendance(
      buildInput({
        selectedSessionIds: [S1, S2],
        answers: [
          { type: "MC", answer: 0 },
          { type: "CODE", answer: "x".repeat(101) },
        ],
      }),
    );
    expect(result.status).toBe("invalid");
    expect(loadEventByToken).not.toHaveBeenCalled();
  });
});

describe("submitEventAttendance — host survey", () => {
  const Q_SINGLE = "d1d1d1d1-0000-4000-8000-000000000001";
  const Q_MULTI = "d1d1d1d1-0000-4000-8000-000000000002";
  const Q_LONG = "d1d1d1d1-0000-4000-8000-000000000003";
  const SURVEY = [
    { id: Q_SINGLE, type: "SINGLE_CHOICE", prompt: "Satisfied?", required: true, options: ["Yes", "No"] },
    { id: Q_MULTI, type: "MULTI_CHOICE", prompt: "Roles?", required: false, options: ["Attendee", "Speaker", "Other"] },
    { id: Q_LONG, type: "LONG_TEXT", prompt: "Comments?", required: false },
  ];

  function mockSurveyEvent(surveyEnabled: boolean) {
    loadEventByToken.mockResolvedValue({
      id: "event-1",
      companyId: "company-1",
      name: "Big Live Event",
      eventIdNumber: "ACE-EVT-1",
      status: "APPROVED",
      expiresAt: new Date(Date.now() + 864e5),
      survey: SURVEY,
      company: { certBalance: 10, surveyEnabled },
    });
    assembleForSubmit.mockReturnValue(ASSEMBLED);
  }

  let tokenSeq = 0;
  // A fresh token per call: the in-memory rate limiter allows 5 per token.
  const nextToken = () => `eeeeeeee-eeee-4eee-8eee-${String(++tokenSeq).padStart(12, "0")}`;

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.issuedCertificate.findMany.mockResolvedValue([]);
    prismaMock.issuedCertificate.update.mockResolvedValue({});
    renderEventCertificatePdf.mockResolvedValue(Buffer.from("EVT-PDF-BYTES"));
    uploadToStorage.mockResolvedValue({ storagePath: "cert-evt-123.pdf" });
    sendEmail.mockResolvedValue(undefined);
    signCertClaimToken.mockReturnValue("signed-token");
  });

  it("a missing required answer returns invalid keyed by question and writes no attempt", async () => {
    mockSurveyEvent(true);
    prismaMock.$transaction.mockResolvedValue("cert-evt-123");

    const result = await submitEventAttendance(
      buildInput({ token: nextToken(), survey: { [Q_LONG]: "Great event" } }),
    );

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") return;
    expect(Object.keys(result.fieldErrors)).toEqual([`survey.${Q_SINGLE}`]);
    // Validated before the attempts lookup: no attempt read, no row, no cert.
    expect(prismaMock.issuedCertificate.findMany).not.toHaveBeenCalled();
    expect(prismaMock.issuedCertificate.create).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("an option not in the survey is rejected without an attempt", async () => {
    mockSurveyEvent(true);
    const result = await submitEventAttendance(
      buildInput({ token: nextToken(), survey: { [Q_SINGLE]: "Maybe" } }),
    );
    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") return;
    expect(result.fieldErrors[`survey.${Q_SINGLE}`]?.length).toBeGreaterThan(0);
    expect(prismaMock.issuedCertificate.create).not.toHaveBeenCalled();
  });

  it("saves the answer snapshots on a failed attempt", async () => {
    mockSurveyEvent(true);
    const result = await submitEventAttendance(
      buildInput({
        token: nextToken(),
        answers: [{ type: "MC", answer: 1 }],
        survey: { [Q_SINGLE]: "No", [Q_MULTI]: ["Speaker", "Attendee"], [Q_LONG]: "  " },
      }),
    );

    expect(result.status).toBe("failed");
    const row = prismaMock.issuedCertificate.create.mock.calls[0][0].data;
    expect(row.surveyResponses).toEqual([
      { questionId: Q_SINGLE, type: "SINGLE_CHOICE", prompt: "Satisfied?", value: "No" },
      // Option order, not click order; the blank optional answer is omitted.
      { questionId: Q_MULTI, type: "MULTI_CHOICE", prompt: "Roles?", value: ["Attendee", "Speaker"] },
    ]);
  });

  it("saves the answer snapshots on the issued certificate when the attendee passes", async () => {
    mockSurveyEvent(true);
    // Run the real transaction body against a mock tx so issueEventCertificateTx
    // writes the cert row we can inspect.
    const tx = {
      $executeRaw: vi.fn(async () => 1),
      issuedCertificate: {
        findFirst: vi.fn(async () => null),
        create: vi.fn<(args: { data: Record<string, unknown> }) => Promise<{ id: string }>>(
          async () => ({ id: "cert-evt-123" }),
        ),
      },
      company: {
        findUniqueOrThrow: vi.fn(async () => ({ certBalance: 10 })),
        update: vi.fn(async () => ({})),
      },
      event: { update: vi.fn(async () => ({})) },
    };
    prismaMock.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));

    const result = await submitEventAttendance(
      buildInput({ token: nextToken(), survey: { [Q_SINGLE]: "Yes", [Q_LONG]: " Loved it " } }),
    );

    expect(result).toEqual({ status: "passed", certificateId: "cert-evt-123", creditedSessionIds: [] });
    expect(tx.issuedCertificate.create.mock.calls[0][0].data.surveyResponses).toEqual([
      { questionId: Q_SINGLE, type: "SINGLE_CHOICE", prompt: "Satisfied?", value: "Yes" },
      { questionId: Q_LONG, type: "LONG_TEXT", prompt: "Comments?", value: "Loved it" },
    ]);
  });

  it("ignores posted answers when the company has surveys switched off", async () => {
    mockSurveyEvent(false);
    const result = await submitEventAttendance(
      buildInput({
        token: nextToken(),
        answers: [{ type: "MC", answer: 1 }],
        // Would fail validation (required answer missing) if the survey were active.
        survey: { [Q_LONG]: "Should not be stored" },
      }),
    );

    expect(result.status).toBe("failed");
    const row = prismaMock.issuedCertificate.create.mock.calls[0][0].data;
    expect(row).not.toHaveProperty("surveyResponses");
  });
});
