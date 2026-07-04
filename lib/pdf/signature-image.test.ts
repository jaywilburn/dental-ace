import { describe, it, expect } from "vitest";
import { renderScriptSignaturePng } from "./signature-image";

describe("renderScriptSignaturePng", () => {
  it("returns a PNG buffer", async () => {
    const png = await renderScriptSignaturePng("Dr. Clifford Feingold, DDS");
    expect(png.subarray(0, 8).toString("latin1")).toBe("\x89PNG\r\n\x1a\n");
    expect(png.length).toBeGreaterThan(100);
  });

  it("varies by name", async () => {
    const a = await renderScriptSignaturePng("Dr. A, DDS");
    const b = await renderScriptSignaturePng("Dr. B, DDS");
    expect(a.equals(b)).toBe(false);
  });
});
