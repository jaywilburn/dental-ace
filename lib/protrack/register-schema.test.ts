import { describe, it, expect } from "vitest";
import { registerSchema } from "@/lib/protrack/register-schema";

const valid = {
  firstName: "Jane",
  lastName: "Hygienist",
  email: "jane@example.com",
  password: "correct-horse-battery",
};

describe("registerSchema email", () => {
  it("accepts and lowercases a valid address", () => {
    const parsed = registerSchema.safeParse({ ...valid, email: " Jane@Example.com " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe("jane@example.com");
  });

  it("rejects a non-existent TLD with a did-you-mean message", () => {
    const parsed = registerSchema.safeParse({ ...valid, email: "jane@gmail.con" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0]?.message).toBe(
      "Check your email address. Did you mean jane@gmail.com?",
    );
  });

  it("accepts a provider misspelling (it could be a real domain)", () => {
    expect(registerSchema.safeParse({ ...valid, email: "jane@gmial.com" }).success).toBe(true);
  });
});
