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

  it("honors a custom ttlSeconds (longer invite window)", async () => {
    const { signSetPasswordToken, verifySetPasswordToken } = await import("@/lib/auth/set-password-token");
    const issuedAt = 1_000_000; // seconds
    const thirtyDays = 60 * 60 * 24 * 30;
    const token = signSetPasswordToken("user-123", issuedAt, thirtyDays);
    // Still valid at 29 days (would be long expired under the default 24h window)...
    expect(verifySetPasswordToken(token, issuedAt + 60 * 60 * 24 * 29)).toBe("user-123");
    // ...and expired past 30 days.
    expect(verifySetPasswordToken(token, issuedAt + 60 * 60 * 24 * 31)).toBe(null);
  });

  it("core and server-only re-export produce interchangeable tokens", async () => {
    const core = await import("@/lib/auth/set-password-token-core");
    const reexport = await import("@/lib/auth/set-password-token");
    const token = core.signSetPasswordToken("user-abc");
    expect(reexport.verifySetPasswordToken(token)).toBe("user-abc");
  });

  it("does not accept an email-verification token (prefix isolation)", async () => {
    const { verifySetPasswordToken } = await import("@/lib/auth/set-password-token");
    const { signEmailVerificationToken } = await import("@/lib/auth/verification-token");
    const verifyToken = signEmailVerificationToken("user-123");
    expect(verifySetPasswordToken(verifyToken)).toBe(null);
  });
});
