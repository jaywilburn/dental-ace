import { describe, it, expect } from "vitest";
import {
  daysUntil,
  dueCourseReminders,
  balanceAlertKind,
  isCooldownElapsed,
} from "@/lib/notifications/lifecycle";

const now = new Date("2026-06-03T00:00:00Z");
const inDays = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

describe("daysUntil", () => {
  it("counts whole days ahead (ceil)", () => {
    expect(daysUntil(inDays(30), now)).toBe(30);
    expect(daysUntil(new Date(now.getTime() + 1000), now)).toBe(1);
    expect(daysUntil(now, now)).toBe(0);
  });
});

describe("dueCourseReminders", () => {
  it("returns nothing beyond 60 days", () => {
    expect(dueCourseReminders(61)).toEqual([]);
  });
  it("returns d60 between 31 and 60 inclusive", () => {
    expect(dueCourseReminders(60)).toEqual(["d60"]);
    expect(dueCourseReminders(31)).toEqual(["d60"]);
  });
  it("returns both d60 and d30 at 30 or fewer days", () => {
    expect(dueCourseReminders(30)).toEqual(["d60", "d30"]);
    expect(dueCourseReminders(1)).toEqual(["d60", "d30"]);
  });
});

describe("balanceAlertKind", () => {
  it("returns exhausted at zero", () => {
    expect(balanceAlertKind(0, 25)).toBe("exhausted");
  });
  it("returns low at or below threshold but above zero", () => {
    expect(balanceAlertKind(25, 25)).toBe("low");
    expect(balanceAlertKind(1, 25)).toBe("low");
  });
  it("returns null above threshold", () => {
    expect(balanceAlertKind(26, 25)).toBe(null);
  });
});

describe("isCooldownElapsed", () => {
  it("is true when never sent", () => {
    expect(isCooldownElapsed(null, now, 7)).toBe(true);
  });
  it("is false within the window", () => {
    expect(isCooldownElapsed(inDays(-6), now, 7)).toBe(false);
  });
  it("is true at or beyond the window", () => {
    expect(isCooldownElapsed(inDays(-7), now, 7)).toBe(true);
  });
});
