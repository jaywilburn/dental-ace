import { describe, expect, it } from "vitest";
import { planCertMerge, type MergeSession } from "@/lib/attend/cert-merge";

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
