import { describe, it, expect } from "vitest";
import PDFDocument from "pdfkit";
import { drawAadbSeal } from "@/lib/pdf/seal";

describe("drawAadbSeal", () => {
  it("draws the vector seal without throwing and yields a valid PDF", async () => {
    const buf = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: "LETTER", margin: 0 });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      drawAadbSeal(doc, { cx: 300, cy: 300, r: 40 });
      doc.end();
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });
});
