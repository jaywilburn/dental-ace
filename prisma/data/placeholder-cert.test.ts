import { describe, it, expect } from "vitest";
import { placeholderCertificatePdf } from "./placeholder-cert";

describe("placeholderCertificatePdf", () => {
  it("returns a non-empty Buffer that starts with the PDF magic header", () => {
    const buf = placeholderCertificatePdf();
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("ends with a valid trailer and EOF marker", () => {
    const text = placeholderCertificatePdf().toString("latin1");
    expect(text).toContain("startxref");
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("emits xref offsets that match the actual byte positions of each object", () => {
    const text = placeholderCertificatePdf().toString("latin1");

    // The xref's startxref value must point at the literal "xref" keyword.
    const startxref = Number(text.match(/startxref\n(\d+)/)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");

    // Every "N 0 obj" must live at the offset recorded in the xref table.
    const entries = text
      .slice(text.indexOf("xref\n0 "))
      .match(/^(\d{10}) 00000 n $/gm)!
      .map((line) => Number(line.slice(0, 10)));
    for (let i = 0; i < entries.length; i++) {
      expect(text.slice(entries[i], entries[i] + 7)).toBe(`${i + 1} 0 obj`);
    }
  });

  it("is deterministic (idempotent seed → stable bytes)", () => {
    expect(placeholderCertificatePdf().equals(placeholderCertificatePdf())).toBe(
      true,
    );
  });
});
