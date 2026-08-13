import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-1234"; // >=32 chars
});

describe("reset-password-token", () => {
  it("round-trips a userId", async () => {
    const { signResetPasswordToken, verifyResetPasswordToken } = await import("@/lib/auth/reset-password-token");
    const token = signResetPasswordToken("user-123");
    expect(verifyResetPasswordToken(token)).toBe("user-123");
  });

  it("rejects a tampered token", async () => {
    const { signResetPasswordToken, verifyResetPasswordToken } = await import("@/lib/auth/reset-password-token");
    const token = signResetPasswordToken("user-123");
    const tampered = token.slice(0, -2) + (token.endsWith("a") ? "bb" : "aa");
    expect(verifyResetPasswordToken(tampered)).toBe(null);
  });

  it("rejects an expired token (1h default window)", async () => {
    const { signResetPasswordToken, verifyResetPasswordToken } = await import("@/lib/auth/reset-password-token");
    const issuedAt = 1_000_000; // seconds
    const token = signResetPasswordToken("user-123", issuedAt);
    // Still valid ten minutes in...
    expect(verifyResetPasswordToken(token, issuedAt + 60 * 10)).toBe("user-123");
    // ...expired just past one hour.
    expect(verifyResetPasswordToken(token, issuedAt + 60 * 60 + 1)).toBe(null);
  });

  it("honors a custom ttlSeconds", async () => {
    const { signResetPasswordToken, verifyResetPasswordToken } = await import("@/lib/auth/reset-password-token");
    const issuedAt = 1_000_000; // seconds
    const twoHours = 60 * 60 * 2;
    const token = signResetPasswordToken("user-123", issuedAt, twoHours);
    expect(verifyResetPasswordToken(token, issuedAt + 60 * 90)).toBe("user-123");
    expect(verifyResetPasswordToken(token, issuedAt + 60 * 60 * 3)).toBe(null);
  });

  it("core and server-only re-export produce interchangeable tokens", async () => {
    const core = await import("@/lib/auth/reset-password-token-core");
    const reexport = await import("@/lib/auth/reset-password-token");
    const token = core.signResetPasswordToken("user-abc");
    expect(reexport.verifyResetPasswordToken(token)).toBe("user-abc");
  });

  it("does not accept a set-password or verification token (prefix isolation)", async () => {
    const { verifyResetPasswordToken } = await import("@/lib/auth/reset-password-token");
    const { signSetPasswordToken } = await import("@/lib/auth/set-password-token");
    const { signEmailVerificationToken } = await import("@/lib/auth/verification-token");
    expect(verifyResetPasswordToken(signSetPasswordToken("user-123"))).toBe(null);
    expect(verifyResetPasswordToken(signEmailVerificationToken("user-123"))).toBe(null);
  });

  it("its own token is not accepted as a set-password token (reverse isolation)", async () => {
    const { signResetPasswordToken } = await import("@/lib/auth/reset-password-token");
    const { verifySetPasswordToken } = await import("@/lib/auth/set-password-token");
    expect(verifySetPasswordToken(signResetPasswordToken("user-123"))).toBe(null);
  });
});
