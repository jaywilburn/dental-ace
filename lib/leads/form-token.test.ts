import { describe, it, expect, beforeAll } from "vitest";
import {
  checkLeadFormToken,
  hashLeadIp,
  LEAD_FORM_MAX_AGE_MS,
  LEAD_FORM_MIN_FILL_MS,
  signLeadFormToken,
} from "@/lib/leads/form-token";

beforeAll(() => {
  process.env.SESSION_SECRET ??= "test-secret-that-is-at-least-32-characters-long";
});

const T0 = 1_762_300_000_000;

describe("lead form token", () => {
  it("accepts a form filled at human speed", () => {
    expect(checkLeadFormToken(signLeadFormToken(T0), T0 + 20_000)).toBe("ok");
  });

  it("rejects a submission faster than a person could fill the form", () => {
    expect(checkLeadFormToken(signLeadFormToken(T0), T0 + LEAD_FORM_MIN_FILL_MS - 1)).toBe("too_fast");
  });

  it("rejects a token older than a day", () => {
    expect(checkLeadFormToken(signLeadFormToken(T0), T0 + LEAD_FORM_MAX_AGE_MS + 1)).toBe("expired");
  });

  it("rejects a missing, malformed or forged token", () => {
    expect(checkLeadFormToken(null, T0)).toBe("invalid");
    expect(checkLeadFormToken("", T0)).toBe("invalid");
    expect(checkLeadFormToken("not-a-token", T0)).toBe("invalid");
    const [, sig] = signLeadFormToken(T0).split(".");
    // Backdating the timestamp to dodge the speed check breaks the signature.
    expect(checkLeadFormToken(`${T0 - 60_000}.${sig}`, T0)).toBe("invalid");
  });

  it("hashes IPs stably without storing them", () => {
    expect(hashLeadIp("203.0.113.7")).toBe(hashLeadIp("203.0.113.7"));
    expect(hashLeadIp("203.0.113.7")).not.toContain("203.0.113.7");
    expect(hashLeadIp("203.0.113.7")).not.toBe(hashLeadIp("203.0.113.8"));
  });
});
