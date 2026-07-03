import { describe, it, expect } from "vitest";
import { SIGNATURE_FONT_BASE64 } from "./signature-font";

describe("signature font", () => {
  it("decodes to a valid sfnt/TrueType font", () => {
    const buf = Buffer.from(SIGNATURE_FONT_BASE64, "base64");
    expect(buf.length).toBeGreaterThan(10000);
    // 0x00010000 (TrueType/glyf) or 0x4F54544F ("OTTO", CFF).
    expect([0x00010000, 0x4f54544f]).toContain(buf.readUInt32BE(0));
  });
});
