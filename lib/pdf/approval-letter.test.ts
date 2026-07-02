import { describe, it, expect } from "vitest";
import { renderApprovalLetterPdf } from "@/lib/pdf/approval-letter";

const baseInput = {
  companyName: "Texas Dental Association",
  courseTitle:
    "Advanced Infection Control and Sterilization Protocols for the Modern Dental Practice",
  courseIdNumber: "ACE-2026-00042",
  ceHours: 2,
  approvedAt: new Date("2026-06-29T12:00:00Z"),
  expiresAt: new Date("2028-06-29T12:00:00Z"),
  presidentName: "Dr. Clifford Feingold, DDS",
  presidentTitle: "President, American Association of Dental Boards",
};

// Counts page objects (`/Type /Page`) without matching the page-tree node
// (`/Type /Pages`). PDFKit writes these dictionaries uncompressed, so the count
// is a reliable proxy for "the signature block and footer did not overflow onto
// a second page and clip."
function countPdfPages(buf: Buffer): number {
  return (buf.toString("latin1").match(/\/Type\s*\/Page(?![s])/g) ?? []).length;
}

describe("renderApprovalLetterPdf", () => {
  it("returns a non-empty, valid PDF buffer", async () => {
    const buf = await renderApprovalLetterPdf(baseInput);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("stays on a single page with the script-font signature", async () => {
    const buf = await renderApprovalLetterPdf(baseInput);
    expect(countPdfPages(buf)).toBe(1);
  });

  it("stays on a single page with an uploaded signature image", async () => {
    // Minimal valid 1x1 PNG (RGBA, opaque black pixel). NOTE: the brief's
    // original fixture bytes decode to a PNG whose IDAT chunk is missing its
    // 4-byte zlib Adler-32 trailer (verified via CRC32 mismatch + a failed
    // `zlib.inflateSync`), so pdfkit's bundled png-js parser threw "Incomplete
    // or corrupt PNG file" regardless of renderer/sigBlockTop changes. This
    // fixture was regenerated from scratch (IHDR/IDAT/IEND with correct CRCs
    // and a valid zlib stream) and round-trips through pdfkit's doc.image().
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==",
      "base64",
    );
    const buf = await renderApprovalLetterPdf({ ...baseInput, signatureImage: png });
    expect(countPdfPages(buf)).toBe(1);
  });

  it("reflects the president name in the output", async () => {
    const a = await renderApprovalLetterPdf(baseInput);
    const b = await renderApprovalLetterPdf({
      ...baseInput,
      presidentName: "Dr. Someone Else, DDS",
    });
    expect(a.equals(b)).toBe(false);
  });
});
