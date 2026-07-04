import { describe, it, expect } from "vitest";
import { isRenderablePdfImage } from "./validate-image";
import { renderScriptSignaturePng } from "./signature-image";

describe("isRenderablePdfImage", () => {
  it("accepts a real PNG produced by the signature renderer", async () => {
    const png = await renderScriptSignaturePng("Dr. Test, DDS");
    expect(isRenderablePdfImage(png)).toBe(true);
  });
  it("rejects non-image bytes", () => {
    expect(isRenderablePdfImage(Buffer.from("this is not an image"))).toBe(false);
  });
  it("rejects a PNG-magic-but-corrupt buffer", () => {
    // Valid PNG signature bytes, but no valid IHDR/data after them.
    const bogus = Buffer.from("89504e470d0a1a0a00000000", "hex");
    expect(isRenderablePdfImage(bogus)).toBe(false);
  });
});
