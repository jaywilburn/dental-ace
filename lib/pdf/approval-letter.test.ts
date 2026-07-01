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
  reviewerName: "Dr. Maria Gonzalez, DDS",
};

// Counts page objects (`/Type /Page`) without matching the page-tree node
// (`/Type /Pages`). PDFKit writes these dictionaries uncompressed, so the
// count is a reliable proxy for "the footer/president block did not overflow
// onto a second page and clip."
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

  it("stays on a single page so the president credit and footer cannot clip", async () => {
    const buf = await renderApprovalLetterPdf(baseInput);
    expect(countPdfPages(buf)).toBe(1);
  });

  it("renders without a reviewer name and still stays on one page", async () => {
    const buf = await renderApprovalLetterPdf({
      ...baseInput,
      reviewerName: undefined,
    });
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(countPdfPages(buf)).toBe(1);
  });
});
