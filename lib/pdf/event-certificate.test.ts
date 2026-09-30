import { describe, it, expect } from "vitest";
import PDFDocument from "pdfkit";
import {
  renderEventCertificatePdf,
  sessionsLine,
  fitSessionsText,
  SEAL_TOP,
} from "@/lib/pdf/event-certificate";

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

  it("renders per-session hours and stays on one page with 8 long sessions", async () => {
    const buf = await renderEventCertificatePdf({
      ...baseInput,
      ceHours: 8,
      deliveryMethod: "LIVE In Person",
      licenseNumber: "TX-RDH-91043",
      sessions: EIGHT_LONG_SESSIONS,
      sessionHours: EIGHT_LONG_SESSIONS.map(() => 1),
    });
    expect(countPdfPages(buf)).toBe(1);
    const titlesOnly = await renderEventCertificatePdf({
      ...baseInput,
      ceHours: 8,
      deliveryMethod: "LIVE In Person",
      licenseNumber: "TX-RDH-91043",
      sessions: EIGHT_LONG_SESSIONS,
    });
    expect(normalizePdf(buf)).not.toBe(normalizePdf(titlesOnly));
  });
});

// Eight sessions with realistically long titles (the Smile Together shape:
// 8 x 1 CE hour), each printed with its hours.
const EIGHT_LONG_SESSIONS = [
  "Advanced Infection Control and Sterilization Protocols for the Modern Office",
  "Radiography Safety and Image Quality for the Contemporary Dental Practice",
  "Ethics and Jurisprudence for Texas Dental Professionals and Their Teams",
  "Local Anesthesia Refresher for Hygienists: Techniques and Complications",
  "Periodontal Disease Management: Current Evidence and Clinical Protocols",
  "Medical Emergencies in the Dental Office: Preparation and Response",
  "Pediatric Patient Management and Behavior Guidance in General Practice",
  "Opioid Prescribing, Pain Management, and Patient Safety in Dentistry",
];

describe("sessionsLine", () => {
  it("appends each session's CE hours when index-aligned", () => {
    expect(sessionsLine(["Intro", "Deep Dive"], [1, 1.5])).toBe(
      "Sessions completed: Intro (1 CE hour) · Deep Dive (1.5 CE hours)",
    );
  });

  it("prints titles alone when hours are absent or misaligned", () => {
    expect(sessionsLine(["Intro", "Deep Dive"])).toBe("Sessions completed: Intro · Deep Dive");
    expect(sessionsLine(["Intro", "Deep Dive"], [1])).toBe("Sessions completed: Intro · Deep Dive");
  });
});

describe("fitSessionsText", () => {
  // The tightest stack with sessions: CE line at 304, a lone format row
  // at 326 (+22; format + license share one +20 row), then the sessions text
  // starts 2pt lower and must end above the seal.
  const TOP = 326 + 22 + 2;
  const newDoc = () => new PDFDocument({ size: "LETTER", layout: "landscape", margin: 0 });

  it("fits 8 long sessions with hours above the seal without clipping", () => {
    const doc = newDoc();
    const width = doc.page.width - 144;
    const maxHeight = SEAL_TOP - 4 - TOP;
    const text = sessionsLine(EIGHT_LONG_SESSIONS, EIGHT_LONG_SESSIONS.map(() => 1));
    const fit = fitSessionsText(doc, text, width, maxHeight);
    expect(fit.clip).toBe(false);
    doc.font("Helvetica").fontSize(fit.fontSize);
    expect(TOP + doc.heightOfString(text, { width, align: "center" })).toBeLessThanOrEqual(SEAL_TOP);
    doc.end();
  });

  it("keeps the full size for a short list", () => {
    const doc = newDoc();
    const fit = fitSessionsText(doc, sessionsLine(["Intro"], [1]), doc.page.width - 144, 100);
    expect(fit).toEqual({ fontSize: 9.5, clip: false });
    doc.end();
  });

  it("falls back to the minimum size with clipping when nothing fits", () => {
    const doc = newDoc();
    const fit = fitSessionsText(doc, sessionsLine(EIGHT_LONG_SESSIONS.concat(EIGHT_LONG_SESSIONS)), 200, 5);
    expect(fit).toEqual({ fontSize: 6, clip: true });
    doc.end();
  });
});
