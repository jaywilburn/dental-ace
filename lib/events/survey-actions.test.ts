import { describe, it, expect, vi, beforeEach } from "vitest";

/*
  Survey save actions (company + admin). The real saveSurveyCore runs against
  the transaction mock, so id keeping and the type-change re-id are exercised
  end to end through each action.
*/

const { requireDentalAce, requireStaff, recordAdminAction, txMock, prismaMock, revalidatePath } =
  vi.hoisted(() => {
    const txMock = {
      $executeRaw: vi.fn(),
      event: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        update: vi.fn(),
      },
    };
    return {
      requireDentalAce: vi.fn(),
      requireStaff: vi.fn(),
      recordAdminAction: vi.fn(),
      txMock,
      prismaMock: {
        $transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
      },
      revalidatePath: vi.fn(),
    };
  });

vi.mock("@/lib/auth/session", () => ({ requireDentalAce, requireStaff }));
vi.mock("@/lib/admin/audit", () => ({ recordAdminAction }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/cache", () => ({ revalidatePath }));

import { saveAdminEventSurvey, saveCompanyEventSurvey } from "@/lib/events/survey-actions";

const EVENT = "2e5bab85-0000-4000-8000-000000000001";
const COMPANY = "5425fb59-0000-4000-8000-000000000001";
const Q1 = "11111111-1111-4111-8111-111111111111";

const STORED = [
  { id: Q1, type: "SINGLE_CHOICE", prompt: "Overall satisfaction", required: true, options: ["Good", "Poor"] },
];

function form(questions: unknown, eventId = EVENT): FormData {
  const fd = new FormData();
  fd.set("eventId", eventId);
  fd.set("questions", typeof questions === "string" ? questions : JSON.stringify(questions));
  return fd;
}

const ADDED = [
  ...STORED,
  { type: "LONG_TEXT", prompt: "Anything else?", required: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  requireDentalAce.mockResolvedValue({ id: "user-1", companyId: COMPANY });
  requireStaff.mockResolvedValue({ id: "admin-1" });
  txMock.event.findFirst.mockResolvedValue({ status: "APPROVED", company: { surveyEnabled: true } });
  txMock.event.findUnique.mockResolvedValue({
    name: "AADB Annual Meeting",
    eventIdNumber: "EV-0001",
    status: "APPROVED",
    companyId: COMPANY,
    company: { name: "AADB", surveyEnabled: true },
  });
  txMock.event.findUniqueOrThrow.mockResolvedValue({ survey: STORED });
});

describe("saveCompanyEventSurvey", () => {
  it("saves the survey for the company's own event and returns the saved questions", async () => {
    const r = await saveCompanyEventSurvey(null, form(ADDED));
    expect(requireDentalAce).toHaveBeenCalled();
    expect(txMock.event.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: EVENT, companyId: COMPANY } }),
    );
    if (!r?.ok) throw new Error("expected ok");
    expect(r.questions).toHaveLength(2);
    expect(r.questions[0].id).toBe(Q1);
    expect(r.questions[1].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof r.savedAt).toBe("number");
    expect(txMock.event.update).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith(`/company/events/${EVENT}`);
  });

  it("never writes an audit row", async () => {
    await saveCompanyEventSurvey(null, form(ADDED));
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it("refuses another company's event (ownership is in the lookup)", async () => {
    txMock.event.findFirst.mockResolvedValue(null);
    const r = await saveCompanyEventSurvey(null, form(ADDED));
    expect(r).toEqual({ ok: false, errors: { survey: [expect.any(String)] } });
    expect(txMock.event.update).not.toHaveBeenCalled();
  });

  it("refuses when the company has event surveys turned off", async () => {
    txMock.event.findFirst.mockResolvedValue({ status: "APPROVED", company: { surveyEnabled: false } });
    const r = await saveCompanyEventSurvey(null, form(ADDED));
    expect(r?.ok).toBe(false);
    expect(txMock.$executeRaw).not.toHaveBeenCalled();
    expect(txMock.event.update).not.toHaveBeenCalled();
  });

  it("refuses a DRAFT event", async () => {
    txMock.event.findFirst.mockResolvedValue({ status: "DRAFT", company: { surveyEnabled: true } });
    const r = await saveCompanyEventSurvey(null, form(ADDED));
    expect(r?.ok).toBe(false);
    expect(txMock.event.update).not.toHaveBeenCalled();
  });

  it("stays editable on a REJECTED event (the survey is not accreditation content)", async () => {
    txMock.event.findFirst.mockResolvedValue({ status: "REJECTED", company: { surveyEnabled: true } });
    const r = await saveCompanyEventSurvey(null, form(ADDED));
    expect(r?.ok).toBe(true);
  });

  it("returns field errors keyed by question index and field", async () => {
    const r = await saveCompanyEventSurvey(
      null,
      form([...STORED, { type: "MULTI_CHOICE", prompt: " ", required: false, options: ["A", "a"] }]),
    );
    if (r?.ok !== false) throw new Error("expected errors");
    expect(r.errors["1.prompt"]).toBeDefined();
    expect(r.errors["1.options.1"]).toBeDefined();
    expect(txMock.event.update).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a malformed event id before touching the DB", async () => {
    const r = await saveCompanyEventSurvey(null, form(ADDED, "not-a-uuid"));
    expect(r?.ok).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("returns a form-level error for unparseable JSON", async () => {
    const r = await saveCompanyEventSurvey(null, form("{nope"));
    if (r?.ok !== false) throw new Error("expected errors");
    expect(r.errors.survey).toBeDefined();
    expect(txMock.event.update).not.toHaveBeenCalled();
  });

  it("re-ids a question whose type changed", async () => {
    const r = await saveCompanyEventSurvey(
      null,
      form([{ id: Q1, type: "MULTI_CHOICE", prompt: "Overall satisfaction", required: true, options: ["Good", "Poor"] }]),
    );
    if (!r?.ok) throw new Error("expected ok");
    expect(r.questions[0].id).not.toBe(Q1);
    expect(r.questions[0].type).toBe("MULTI_CHOICE");
  });
});

describe("saveAdminEventSurvey", () => {
  it("requires an ADMIN and audits the change in the same transaction", async () => {
    const r = await saveAdminEventSurvey(null, form(ADDED));
    expect(requireStaff).toHaveBeenCalledWith("ADMIN");
    if (!r?.ok) throw new Error("expected ok");
    expect(txMock.event.update).toHaveBeenCalledTimes(1);
    expect(recordAdminAction).toHaveBeenCalledWith(txMock, {
      actorUserId: "admin-1",
      action: "EVENT_SURVEY_UPDATED",
      summary: 'Updated the survey for event "AADB Annual Meeting" (2 questions)',
      details: {
        companyId: COMPANY,
        companyName: "AADB",
        eventId: EVENT,
        eventName: "AADB Annual Meeting",
        questionCount: 2,
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/companies/${COMPANY}`);
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/companies/${COMPANY}/events/${EVENT}/survey`);
  });

  it("writes no audit row when the survey is unchanged", async () => {
    const r = await saveAdminEventSurvey(null, form(STORED));
    expect(r?.ok).toBe(true);
    expect(txMock.event.update).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it("writes no audit row when validation fails", async () => {
    const r = await saveAdminEventSurvey(null, form([{ type: "SHORT_TEXT", prompt: "", required: false }]));
    expect(r?.ok).toBe(false);
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it("refuses when the company has event surveys turned off", async () => {
    txMock.event.findUnique.mockResolvedValue({
      name: "AADB Annual Meeting",
      eventIdNumber: "EV-0001",
      status: "APPROVED",
      companyId: COMPANY,
      company: { name: "AADB", surveyEnabled: false },
    });
    const r = await saveAdminEventSurvey(null, form(ADDED));
    expect(r?.ok).toBe(false);
    expect(txMock.event.update).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it("refuses a DRAFT or missing event", async () => {
    txMock.event.findUnique.mockResolvedValueOnce(null);
    expect((await saveAdminEventSurvey(null, form(ADDED)))?.ok).toBe(false);
    txMock.event.findUnique.mockResolvedValueOnce({
      name: "x",
      eventIdNumber: null,
      status: "DRAFT",
      companyId: COMPANY,
      company: { name: "AADB", surveyEnabled: true },
    });
    expect((await saveAdminEventSurvey(null, form(ADDED)))?.ok).toBe(false);
    expect(txMock.event.update).not.toHaveBeenCalled();
  });

  it("labels an unnamed event by its Event ID in the audit row", async () => {
    txMock.event.findUnique.mockResolvedValue({
      name: "  ",
      eventIdNumber: "EV-0042",
      status: "PENDING",
      companyId: COMPANY,
      company: { name: "AADB", surveyEnabled: true },
    });
    await saveAdminEventSurvey(null, form(ADDED));
    expect(recordAdminAction).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({
        details: expect.objectContaining({ eventName: "EV-0042" }),
      }),
    );
  });
});
