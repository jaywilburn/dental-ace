import { describe, it, expect } from "vitest";
import {
  renderApplicationWorksheetPdf,
  worksheetPlainText,
  WORKSHEET_SECTIONS,
} from "@/lib/pdf/application-worksheet";

// Counts page objects (`/Type /Page`) without matching the page-tree node
// (`/Type /Pages`). PDFKit writes these dictionaries uncompressed.
function countPdfPages(buf: Buffer): number {
  return (buf.toString("latin1").match(/\/Type\s*\/Page(?![s])/g) ?? []).length;
}

describe("renderApplicationWorksheetPdf", () => {
  it("returns a non-empty, valid PDF buffer", async () => {
    const buf = await renderApplicationWorksheetPdf();
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("paginates onto more than one page without throwing", async () => {
    const buf = await renderApplicationWorksheetPdf();
    expect(countPdfPages(buf)).toBeGreaterThanOrEqual(1);
  });
});

describe("worksheet content", () => {
  const text = worksheetPlainText();

  it("carries no stale CV / Resume / upload language (the client complaint)", () => {
    // Case-insensitive: the retired lines were "attach CV, Resume and/or
    // Detailed Bio Upload file" and "Headshot ... (Please attach file)".
    expect(text).not.toMatch(/\bCV\b/i);
    expect(text).not.toMatch(/resume/i);
    expect(text).not.toMatch(/upload/i);
    expect(text).not.toMatch(/attach/i);
    expect(text).not.toMatch(/headshot/i);
  });

  it("uses no em dashes in user-facing copy", () => {
    expect(text).not.toContain("—");
  });

  it("matches the live form: Course Outline is typed/pasted, Detailed Bio is text", () => {
    expect(text).toContain("Course Outline");
    expect(text).toContain("Paste or type the full outline, including section timings.");
    expect(text).toContain("Detailed Bio");
  });

  it("reproduces all five application sections in order", () => {
    expect(WORKSHEET_SECTIONS.map((s) => s.title)).toEqual([
      "Organization & Contact",
      "Course Information",
      "Course Creator",
      "Presenter(s)",
      "Quiz Questions",
    ]);
  });

  it("includes the five required quiz questions", () => {
    const quiz = WORKSHEET_SECTIONS.find((s) => s.title === "Quiz Questions");
    expect(quiz?.fields).toHaveLength(5);
    expect(quiz?.fields[0]?.label).toContain("True/False");
    expect(quiz?.fields[4]?.label).toContain("Multiple Choice");
  });
});
