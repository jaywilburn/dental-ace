import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-1234"; // >=32 chars
});

describe("set-password-token", () => {
  it("round-trips a userId", async () => {
    const { signSetPasswordToken, verifySetPasswordToken } = await import("@/lib/auth/set-password-token");
    const token = signSetPasswordToken("user-123");
    expect(verifySetPasswordToken(token)).toBe("user-123");
  });

  it("rejects a tampered token", async () => {
    const { signSetPasswordToken, verifySetPasswordToken } = await import("@/lib/auth/set-password-token");
    const token = signSetPasswordToken("user-123");
    const tampered = token.slice(0, -2) + (token.endsWith("a") ? "bb" : "aa");
    expect(verifySetPasswordToken(tampered)).toBe(null);
  });

  it("rejects an expired token", async () => {
    const { signSetPasswordToken, verifySetPasswordToken } = await import("@/lib/auth/set-password-token");
    const issuedAt = 1_000_000; // seconds
    const token = signSetPasswordToken("user-123", issuedAt);
    const wayLater = issuedAt + 60 * 60 * 24 * 2; // 2 days later
    expect(verifySetPasswordToken(token, wayLater)).toBe(null);
    expect(verifySetPasswordToken(token, issuedAt + 10)).toBe("user-123");
  });

  it("does not accept an email-verification token (prefix isolation)", async () => {
    const { verifySetPasswordToken } = await import("@/lib/auth/set-password-token");
    const { signEmailVerificationToken } = await import("@/lib/auth/verification-token");
    const verifyToken = signEmailVerificationToken("user-123");
    expect(verifySetPasswordToken(verifyToken)).toBe(null);
  });
});
