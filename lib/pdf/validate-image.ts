import "server-only";
import PDFDocument from "pdfkit";

/*
  Validate that an uploaded signature image is actually renderable by the
  approval-letter PDF pipeline. Mime + size checks (letter-settings-rules.ts)
  don't guarantee pdfkit can parse the bytes: a valid-mime but unsupported
  variant (CMYK/progressive JPEG, truncated PNG) would pass, get persisted,
  then throw in doc.image() on EVERY later render (callers treat that as
  non-fatal, so letters silently stop generating). Reject at upload time by
  trying exactly what the renderer does: doc.image(buffer).
*/
export function isRenderablePdfImage(buffer: Buffer): boolean {
  try {
    const doc = new PDFDocument();
    doc.image(buffer, 0, 0, { fit: [10, 10] });
    return true;
  } catch {
    return false;
  }
}
