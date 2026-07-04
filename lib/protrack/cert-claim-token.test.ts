import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-1234"; // >=32 chars
});

describe("cert-claim-token", () => {
  it("round-trips a certificate id", async () => {
    const { signCertClaimToken, verifyCertClaimToken } = await import("@/lib/protrack/cert-claim-token");
    const token = signCertClaimToken("cert-123");
    expect(verifyCertClaimToken(token)).toBe("cert-123");
  });

  it("rejects a tampered token", async () => {
    const { signCertClaimToken, verifyCertClaimToken } = await import("@/lib/protrack/cert-claim-token");
    const token = signCertClaimToken("cert-123");
    const tampered = token.slice(0, -2) + (token.endsWith("a") ? "bb" : "aa");
    expect(verifyCertClaimToken(tampered)).toBe(null);
  });

  it("rejects an expired token", async () => {
    const { signCertClaimToken, verifyCertClaimToken } = await import("@/lib/protrack/cert-claim-token");
    const issuedAt = 1_000_000; // seconds
    const token = signCertClaimToken("cert-123", issuedAt);
    const wayLater = issuedAt + 60 * 60 * 24 * 91; // 91 days later (> 90d TTL)
    expect(verifyCertClaimToken(token, wayLater)).toBe(null);
    expect(verifyCertClaimToken(token, issuedAt + 10)).toBe("cert-123");
  });

  it("does not accept a set-password or verification token (prefix isolation)", async () => {
    const { verifyCertClaimToken } = await import("@/lib/protrack/cert-claim-token");
    const { signSetPasswordToken } = await import("@/lib/auth/set-password-token");
    const { signEmailVerificationToken } = await import("@/lib/auth/verification-token");
    expect(verifyCertClaimToken(signSetPasswordToken("cert-123"))).toBe(null);
    expect(verifyCertClaimToken(signEmailVerificationToken("cert-123"))).toBe(null);
  });
});
