import "server-only";
import { existsSync } from "node:fs";

/*
  Placeholder AADB accreditation seal, drawn as a pure PDFKit vector so the
  certificate + approval-letter renderers need no external asset. Navy + gold
  brand, no em dashes. When a real raster/vector seal asset lands, set
  AADB_SEAL_ASSET_PATH (or pass assetPath) and it swaps in via doc.image()
  with the vector ring as the fallback.
*/

const NAVY = "#0B1A2E";
const GOLD = "#C8971A";

export type SealOptions = {
  cx: number; // center x
  cy: number; // center y
  r: number; // outer radius
  assetPath?: string; // optional real seal asset; falls back to the vector
};

export function drawAadbSeal(
  doc: PDFKit.PDFDocument,
  { cx, cy, r, assetPath }: SealOptions,
): void {
  const asset = assetPath ?? process.env.AADB_SEAL_ASSET_PATH;
  if (asset && existsSync(asset)) {
    doc.save();
    doc.image(asset, cx - r, cy - r, { width: r * 2, height: r * 2 });
    doc.restore();
    return;
  }

  doc.save();

  // Outer gold ring + inner navy ring.
  doc.lineWidth(2).strokeColor(GOLD).circle(cx, cy, r).stroke();
  doc.lineWidth(1).strokeColor(NAVY).circle(cx, cy, r - 6).stroke();

  // "AADB" centered.
  doc
    .fillColor(NAVY)
    .font("Times-Bold")
    .fontSize(r * 0.5)
    .text("AADB", cx - r, cy - r * 0.32, { width: r * 2, align: "center" });

  // "ACCREDITED" label beneath the monogram.
  doc
    .fillColor(GOLD)
    .font("Helvetica-Bold")
    .fontSize(Math.max(5, r * 0.16))
    .text("ACCREDITED", cx - r, cy + r * 0.28, {
      width: r * 2,
      align: "center",
      characterSpacing: 1,
    });

  doc.restore();
}
