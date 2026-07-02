import { describe, it, expect } from "vitest";
import {
  validateSignatory,
  validateSignatureImage,
  signatureExt,
} from "./letter-settings-rules";

describe("validateSignatory", () => {
  it("accepts and trims a valid name + title", () => {
    const r = validateSignatory("  Dr. Clifford Feingold, DDS  ", " President, American Association of Dental Boards ");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.presidentName).toBe("Dr. Clifford Feingold, DDS");
      expect(r.value.presidentTitle).toBe("President, American Association of Dental Boards");
    }
  });

  it("rejects an empty name", () => {
    expect(validateSignatory("   ", "President").ok).toBe(false);
  });

  it("rejects an over-long name", () => {
    expect(validateSignatory("x".repeat(121), "President").ok).toBe(false);
  });

  it("rejects an em dash", () => {
    expect(validateSignatory("Dr. A — B", "President").ok).toBe(false);
  });

  it("rejects an empty title", () => {
    expect(validateSignatory("Dr. A, DDS", "   ").ok).toBe(false);
  });

  it("rejects an over-long title", () => {
    expect(validateSignatory("Dr. A, DDS", "x".repeat(161)).ok).toBe(false);
  });

  it("rejects an em dash in the title", () => {
    expect(validateSignatory("Dr. A, DDS", "President — AADB").ok).toBe(false);
  });
});

describe("validateSignatureImage", () => {
  it("accepts a small PNG", () => {
    expect(validateSignatureImage("image/png", 5000).ok).toBe(true);
  });
  it("accepts a small JPEG", () => {
    expect(validateSignatureImage("image/jpeg", 5000).ok).toBe(true);
  });
  it("rejects a GIF", () => {
    expect(validateSignatureImage("image/gif", 5000).ok).toBe(false);
  });
  it("rejects an oversize file", () => {
    expect(validateSignatureImage("image/png", 2_000_000).ok).toBe(false);
  });
  it("rejects a zero-byte file", () => {
    expect(validateSignatureImage("image/png", 0).ok).toBe(false);
  });
});

describe("signatureExt", () => {
  it("maps mime to extension", () => {
    expect(signatureExt("image/png")).toBe("png");
    expect(signatureExt("image/jpeg")).toBe("jpg");
  });
});
