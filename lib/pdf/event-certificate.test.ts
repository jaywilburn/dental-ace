import { describe, it, expect } from "vitest";
import { renderEventCertificatePdf } from "@/lib/pdf/event-certificate";

const baseInput = {
  attendeeName: "Jane Hygienist",
  eventName: "Texas Dental Summit 2026",
  eventIdNumber: "ACE-EVT-2026-00007",
  certificateId: "22222222-2222-2222-2222-222222222222",
  ceHours: 6,
  completedAt: new Date("2026-06-02T12:00:00Z"),
};

// Counts page objects (`/Type /Page`) without matching the page-tree node
// (`/Type /Pages`). PDFKit writes these dictionaries uncompressed, so the
// count is a reliable proxy for "nothing overflowed onto a second page."
function countPdfPages(buf: Buffer): number {
  return (buf.toString("latin1").match(/\/Type\s*\/Page(?![s])/g) ?? []).length;
}

// PDFKit stamps two nondeterministic values into every document: a wall-clock
// /CreationDate in the Info dictionary and a random /ID pair in the trailer.
// Pin both before comparing renders for content (in)equality.
function normalizePdf(buf: Buffer): string {
  return buf
    .toString("latin1")
    .replace(/\/CreationDate \(D:[^)]*\)/g, "/CreationDate (D:0)")
    .replace(/\/ID \[<[0-9a-fA-F]+> <[0-9a-fA-F]+>\]/g, "/ID [<0> <0>]");
}

describe("renderEventCertificatePdf", () => {
  it("returns a non-empty PDF buffer", async () => {
    const buf = await renderEventCertificatePdf(baseInput);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("renders a license number line when one is provided", async () => {
    const without = await renderEventCertificatePdf(baseInput);
    const withLicense = await renderEventCertificatePdf({
      ...baseInput,
      licenseNumber: "TX-RDH-91043",
    });
    expect(normalizePdf(withLicense)).not.toBe(normalizePdf(without));
    expect(countPdfPages(withLicense)).toBe(1);
  });

  it("skips the license line for null, empty, and whitespace-only values", async () => {
    const without = await renderEventCertificatePdf(baseInput);
    const withNull = await renderEventCertificatePdf({ ...baseInput, licenseNumber: null });
    const withEmpty = await renderEventCertificatePdf({ ...baseInput, licenseNumber: "" });
    const withBlank = await renderEventCertificatePdf({ ...baseInput, licenseNumber: "   " });
    expect(normalizePdf(withNull)).toBe(normalizePdf(without));
    expect(normalizePdf(withEmpty)).toBe(normalizePdf(without));
    expect(normalizePdf(withBlank)).toBe(normalizePdf(without));
  });

  it("stays on a single page with format, license, and a long sessions list", async () => {
    // The tightest stack the layout supports: Course Format + license number +
    // a sessions line long enough to wrap. Everything must stay on one page.
    const buf = await renderEventCertificatePdf({
      ...baseInput,
      deliveryMethod: "LIVE In Person",
      licenseNumber: "TX-RDH-91043",
      sessions: [
        "Advanced Infection Control and Sterilization Protocols",
        "Radiography Safety for the Modern Dental Practice",
        "Ethics and Jurisprudence for Texas Dental Professionals",
        "Local Anesthesia Refresher for Hygienists",
      ],
    });
    expect(countPdfPages(buf)).toBe(1);
  });
});
