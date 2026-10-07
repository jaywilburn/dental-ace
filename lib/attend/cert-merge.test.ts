import { describe, expect, it } from "vitest";
import {
  claimSensitiveIds,
  orderMergeWrites,
  planCertMerge,
  type CertMergeWrite,
  type MergeSession,
} from "@/lib/attend/cert-merge";

const sessions: MergeSession[] = [
  { id: "s0", name: "Brain", hours: 1, position: 0 },
  { id: "s1", name: "Brand", hours: 1, position: 1 },
  { id: "s2", name: "Survival", hours: 1.5, position: 2 },
  { id: "s3", name: "Million", hours: 1, position: 3 },
];

describe("planCertMerge", () => {
  it("counts a shared session once and keeps the fuller certificate", () => {
    const plan = planCertMerge({
      sessions,
      certs: [
        { id: "early", passed: true, attendedSessionIds: ["s0"] },
        { id: "late", passed: true, attendedSessionIds: ["s0", "s1", "s2"] },
      ],
    });
    expect(plan.keepId).toBe("late");
    expect(plan.absorbIds).toEqual(["early"]);
    expect(plan.sessionIds).toEqual(["s0", "s1", "s2"]);
    expect(plan.ceHours).toBe(3.5);
    expect(plan.score).toBe(3);
    expect(plan.contentChanged).toBe(false);
  });

  it("unions disjoint certificates in event order and keeps the earlier one on a tie", () => {
    const plan = planCertMerge({
      sessions,
      certs: [
        { id: "first", passed: true, attendedSessionIds: ["s2"] },
        { id: "second", passed: true, attendedSessionIds: ["s0"] },
      ],
    });
    expect(plan.keepId).toBe("first");
    expect(plan.absorbIds).toEqual(["second"]);
    expect(plan.sessionIds).toEqual(["s0", "s2"]);
    expect(plan.sessionNames).toEqual(["Brain", "Survival"]);
    expect(plan.sessionHours).toEqual([1, 1.5]);
    expect(plan.ceHours).toBe(2.5);
    expect(plan.score).toBe(2);
    expect(plan.contentChanged).toBe(true);
  });

  it("adds admin-credited sessions to a single certificate", () => {
    const plan = planCertMerge({
      sessions,
      certs: [{ id: "only", passed: true, attendedSessionIds: ["s1"] }],
      addSessionIds: ["s3", "s1"],
    });
    expect(plan.keepId).toBe("only");
    expect(plan.absorbIds).toEqual([]);
    expect(plan.sessionIds).toEqual(["s1", "s3"]);
    expect(plan.ceHours).toBe(2);
    expect(plan.contentChanged).toBe(true);
  });

  it("is a no-op for an already merged certificate", () => {
    const plan = planCertMerge({
      sessions,
      certs: [{ id: "merged", passed: true, attendedSessionIds: ["s0", "s2"] }],
    });
    expect(plan.absorbIds).toEqual([]);
    expect(plan.contentChanged).toBe(false);
    expect(plan.ceHours).toBe(2.5);
  });

  it("refuses a failed attempt", () => {
    expect(() =>
      planCertMerge({
        sessions,
        certs: [
          { id: "ok", passed: true, attendedSessionIds: ["s0"] },
          { id: "failed", passed: false, attendedSessionIds: ["s1"] },
        ],
      }),
    ).toThrow(/failed/);
  });

  it("refuses a session that is not on the event", () => {
    expect(() =>
      planCertMerge({ sessions, certs: [{ id: "x", passed: true, attendedSessionIds: ["nope"] }] }),
    ).toThrow(/nope/);
    expect(() =>
      planCertMerge({
        sessions,
        certs: [{ id: "x", passed: true, attendedSessionIds: ["s0"] }],
        addSessionIds: ["nope"],
      }),
    ).toThrow(/nope/);
  });

  it("refuses an empty certificate list", () => {
    expect(() => planCertMerge({ sessions, certs: [] })).toThrow(/at least one/);
  });
});

/*
  In-memory stand-in for issued_certificates_event_attendee_uq: one PASSING
  certificate per lower(email) on the event, checked after every statement
  (the real index is not deferrable).
*/
function runWrites(
  rows: { id: string; email: string; passed: boolean }[],
  writes: CertMergeWrite[],
): { id: string; email: string; passed: boolean }[] {
  let state = rows.map((r) => ({ ...r }));
  for (const w of writes) {
    if (w.kind === "delete") {
      state = state.filter((r) => !(w.ids.includes(r.id) && r.passed === w.passed));
    } else {
      state = state.map((r) => (r.id === w.id ? { ...r, email: w.email } : r));
    }
    const seen = new Set<string>();
    for (const r of state.filter((x) => x.passed)) {
      const key = r.email.toLowerCase();
      if (seen.has(key)) throw new Error(`unique violation on ${key}`);
      seen.add(key);
    }
  }
  return state;
}

describe("orderMergeWrites", () => {
  // Etta's shape: the kept (fuller) certificate sits under the SECOND email and
  // the certificate to delete sits under the primary one.
  const rows = [
    { id: "early", email: "primary@example.com", passed: true },
    { id: "late", email: "second@example.com", passed: true },
    { id: "fail", email: "second@example.com", passed: false },
  ];
  const plan = planCertMerge({
    sessions,
    certs: [
      { id: "early", passed: true, attendedSessionIds: ["s0"] },
      { id: "late", passed: true, attendedSessionIds: ["s0", "s1"] },
    ],
  });
  const items = [{ plan, primaryEmail: "Primary@Example.com", failedIds: ["fail"] }];

  it("deletes the duplicates before moving the kept certificate to the primary email", () => {
    const writes = orderMergeWrites(items);
    const firstUpdate = writes.findIndex((w) => w.kind === "update");
    const lastDelete = writes.map((w) => w.kind).lastIndexOf("delete");
    expect(lastDelete).toBeLessThan(firstUpdate);

    const after = runWrites(rows, writes);
    expect(after).toEqual([{ id: "late", email: "primary@example.com", passed: true }]);
  });

  it("would violate the unique index in the opposite order (guards the stand-in)", () => {
    const writes = orderMergeWrites(items);
    const updatesFirst = [...writes.filter((w) => w.kind === "update"), ...writes.filter((w) => w.kind === "delete")];
    expect(() => runWrites(rows, updatesFirst)).toThrow(/unique violation/);
  });

  it("carries the merged sessions, hours and score on the update", () => {
    const update = orderMergeWrites(items).find((w) => w.kind === "update");
    expect(update).toEqual({
      kind: "update",
      id: "late",
      email: "primary@example.com",
      sessionIds: ["s0", "s1"],
      ceHours: 2,
      score: 2,
    });
  });
});

describe("claimSensitiveIds", () => {
  it("lists deleted certificates and kept certificates whose email or content changes", () => {
    const moved = planCertMerge({
      sessions,
      certs: [
        { id: "a-early", passed: true, attendedSessionIds: ["s0"] },
        { id: "a-late", passed: true, attendedSessionIds: ["s0", "s1"] },
      ],
    });
    const grown = planCertMerge({
      sessions,
      certs: [{ id: "b-only", passed: true, attendedSessionIds: ["s0"] }],
      addSessionIds: ["s3"],
    });
    const untouched = planCertMerge({
      sessions,
      certs: [{ id: "c-only", passed: true, attendedSessionIds: ["s2"] }],
    });
    expect(
      claimSensitiveIds([
        { plan: moved, emailChanged: true },
        { plan: grown, emailChanged: false },
        { plan: untouched, emailChanged: false },
      ]).sort(),
    ).toEqual(["a-early", "a-late", "b-only"]);
  });
});
