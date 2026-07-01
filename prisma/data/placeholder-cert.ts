/**
 * A tiny, self-contained placeholder CE certificate PDF for seed data.
 *
 * The seed attaches this to one of Sarah Mitchell's CE certificates so the
 * "↓ Download" link on /protrack/certificates is visible in the demo. We build
 * the bytes by hand (no pdfkit, no external asset) so the seed has zero runtime
 * dependencies: a minimal single-page PDF with one line of Helvetica text. The
 * xref byte offsets are computed from the assembled body, so the table stays
 * valid no matter how the content changes.
 */
export function placeholderCertificatePdf(): Buffer {
  const header = "%PDF-1.4\n";
  const contentStream =
    "BT /F1 18 Tf 72 720 Td (DentalACE One placeholder CE certificate) Tj ET";

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
  ];

  // Record each object's byte offset from the start of the file, then build the
  // cross-reference table from those offsets.
  let body = header;
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += obj;
  }

  const xrefStart = Buffer.byteLength(body, "latin1");
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    // Each entry is exactly 20 bytes: "nnnnnnnnnn 00000 n \n".
    xref += `${off.toString().padStart(10, "0")} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(body + xref + trailer, "latin1");
}
