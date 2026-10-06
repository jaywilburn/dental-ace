import { describe, expect, it } from "vitest";
import { parseMergeArgs } from "./merge-smile-together-args";

describe("parseMergeArgs", () => {
  it("defaults to a dry run", () => {
    expect(parseMergeArgs([])).toEqual({ mode: "dry-run", only: null, testTo: null });
  });

  it("reads each mode", () => {
    expect(parseMergeArgs(["--rehearse"]).mode).toBe("rehearse");
    expect(parseMergeArgs(["--apply"]).mode).toBe("apply");
    expect(parseMergeArgs(["--send-emails"]).mode).toBe("send-emails");
  });

  it("lowercases --only and --test-to for --send-emails", () => {
    expect(parseMergeArgs(["--send-emails", "--only=A@Example.com", "--test-to=Me@Example.com"])).toEqual({
      mode: "send-emails",
      only: "a@example.com",
      testTo: "me@example.com",
    });
  });

  it("rejects --only written with a space, which would otherwise email everyone", () => {
    expect(() => parseMergeArgs(["--send-emails", "--only", "a@example.com"])).toThrow(/--only/);
  });

  it("rejects an unknown flag", () => {
    expect(() => parseMergeArgs(["--aply"])).toThrow(/--aply/);
  });

  it("rejects two modes at once", () => {
    expect(() => parseMergeArgs(["--apply", "--send-emails"])).toThrow(/one of/);
  });

  it("rejects --only and --test-to outside --send-emails", () => {
    expect(() => parseMergeArgs(["--apply", "--only=a@example.com"])).toThrow(/--send-emails/);
    expect(() => parseMergeArgs(["--test-to=a@example.com"])).toThrow(/--send-emails/);
  });

  it("rejects an empty value", () => {
    expect(() => parseMergeArgs(["--send-emails", "--only="])).toThrow(/--only/);
  });
});
