import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { saveSurveyCore } from "@/lib/events/survey-core";
import type { SurveyQuestion } from "@/lib/events/survey-schemas";

/*
  saveSurveyCore: locks the event row, validates against the STORED survey
  (id keeping), writes only on change, and stores an empty survey as SQL NULL.
*/

const EVENT = "2e5bab85-0000-4000-8000-000000000001";
const Q1 = "11111111-1111-4111-8111-111111111111";
const Q2 = "22222222-2222-4222-8222-222222222222";

const STORED: SurveyQuestion[] = [
  { id: Q1, type: "SINGLE_CHOICE", prompt: "Overall satisfaction", required: true, options: ["Good", "Poor"] },
  { id: Q2, type: "LONG_TEXT", prompt: "Comments", required: false },
];

const tx = {
  $executeRaw: vi.fn(),
  event: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
};
const client = tx as unknown as Prisma.TransactionClient;

beforeEach(() => {
  vi.clearAllMocks();
  tx.event.findUniqueOrThrow.mockResolvedValue({ survey: STORED });
});

describe("saveSurveyCore", () => {
  it("locks the event row before reading the stored survey", async () => {
    await saveSurveyCore(client, EVENT, JSON.stringify(STORED));
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.event.findUniqueOrThrow.mock.invocationCallOrder[0],
    );
  });

  it("does not write when nothing changed", async () => {
    const r = await saveSurveyCore(client, EVENT, JSON.stringify(STORED));
    expect(r).toEqual({ ok: true, questions: STORED, changed: false });
    expect(tx.event.update).not.toHaveBeenCalled();
  });

  it("keeps ids for unchanged types and assigns a new id on a type change or a new question", async () => {
    const posted = [
      { id: Q2, type: "SHORT_TEXT", prompt: "Comments", required: false },
      { id: Q1, type: "SINGLE_CHOICE", prompt: "Overall satisfaction", required: true, options: ["Good", "Poor"] },
      { type: "MULTI_CHOICE", prompt: "Sessions", required: false, options: ["A", "B"] },
    ];
    const r = await saveSurveyCore(client, EVENT, JSON.stringify(posted));
    if (!r.ok) throw new Error("expected ok");
    expect(r.changed).toBe(true);
    const [a, b, c] = r.questions;
    expect(a.id).not.toBe(Q2);
    expect(b.id).toBe(Q1);
    expect(c.id).not.toBe(Q1);
    expect(c.id).not.toBe(Q2);
    expect(tx.event.update).toHaveBeenCalledWith({
      where: { id: EVENT },
      data: { survey: r.questions },
    });
  });

  it("ignores ids the server never issued", async () => {
    const forged = "33333333-3333-4333-8333-333333333333";
    const r = await saveSurveyCore(
      client,
      EVENT,
      JSON.stringify([{ id: forged, type: "LONG_TEXT", prompt: "Hi", required: false }]),
    );
    if (!r.ok) throw new Error("expected ok");
    expect(r.questions[0].id).not.toBe(forged);
  });

  it("stores an emptied survey as SQL NULL", async () => {
    const r = await saveSurveyCore(client, EVENT, "[]");
    expect(r).toEqual({ ok: true, questions: [], changed: true });
    expect(tx.event.update).toHaveBeenCalledWith({
      where: { id: EVENT },
      data: { survey: Prisma.DbNull },
    });
  });

  it("returns field errors and writes nothing on invalid input", async () => {
    const r = await saveSurveyCore(
      client,
      EVENT,
      JSON.stringify([{ type: "SINGLE_CHOICE", prompt: "", required: true, options: ["Only one"] }]),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors["0.prompt"]).toBeDefined();
    expect(r.errors["0.options"]).toBeDefined();
    expect(tx.event.update).not.toHaveBeenCalled();
  });

  it("treats a malformed stored survey as empty (every posted id is reissued)", async () => {
    tx.event.findUniqueOrThrow.mockResolvedValue({ survey: { not: "an array" } });
    const r = await saveSurveyCore(client, EVENT, JSON.stringify(STORED));
    if (!r.ok) throw new Error("expected ok");
    expect(r.questions.map((q) => q.id)).not.toContain(Q1);
    expect(r.changed).toBe(true);
  });
});
