import "server-only";
import PDFDocument from "pdfkit";

/*
  PDFKit-rendered approval letter. Generates a single-page A4 letter with
  navy header, gold accent rule, body copy referring to the approved course,
  Course ID + expiry callout, and a footer.

  Returns a Buffer ready for upload to Supabase Storage. No external assets
  needed (typography is system + PDFKit's default fonts).

  When real letterhead + signature assets land, swap in via doc.image().
*/

export type ApprovalLetterInput = {
  companyName: string;
  courseTitle: string;
  courseIdNumber: string;
  ceHours: number;
  approvedAt: Date;
  expiresAt: Date;
  reviewerName?: string;
};

export async function renderApprovalLetterPdf(
  input: ApprovalLetterInput,
): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "LETTER", margin: 56 });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const NAVY = "#0B1A2E";
      const GOLD = "#C8971A";
      const TEXT_MID = "#344E6E";
      const TEXT_MUTED = "#6B87A8";

      // Header bar
      doc.rect(0, 0, doc.page.width, 96).fill(NAVY);
      doc
        .fillColor("#FFFFFF")
        .font("Times-Bold")
        .fontSize(28)
        .text("Dental ", 56, 36, { continued: true })
        .fillColor("#E4C060")
        .text("ACE");
      doc
        .fillColor("rgba(255,255,255,0.55)")
        .font("Helvetica")
        .fontSize(10)
        .text("AADB Accredited Continuing Education Program", 56, 70);

      doc.moveDown(2);

      // Gold accent rule
      doc
        .moveTo(56, 116)
        .lineTo(96, 116)
        .lineWidth(3)
        .strokeColor(GOLD)
        .stroke();

      // Heading
      doc
        .fillColor(NAVY)
        .font("Times-Bold")
        .fontSize(22)
        .text("Letter of Accreditation", 56, 138);

      // Date
      doc
        .font("Helvetica")
        .fontSize(11)
        .fillColor(TEXT_MUTED)
        .text(formatDate(input.approvedAt), 56, 174);

      // Recipient
      doc
        .moveDown(1.4)
        .fontSize(12)
        .fillColor(NAVY)
        .text(`Dear ${input.companyName},`);

      // Body
      doc
        .moveDown(0.5)
        .font("Helvetica")
        .fontSize(11)
        .fillColor(TEXT_MID)
        .text(
          `Following review by the American Association of Dental Boards (AADB), we are pleased to confirm that your continuing-education course has been approved and is now accredited under the Dental ACE program.`,
          { align: "left", lineGap: 4 },
        )
        .moveDown(0.5)
        .text(
          `This accreditation entitles you to issue branded, board-recognized certificates to attendees and verify the course's standing with state dental boards nationwide.`,
          { lineGap: 4 },
        );

      // Course detail box
      doc.moveDown(1).rect(56, doc.y, doc.page.width - 112, 96).fill("#F4F7FB");
      const boxTop = doc.y - 96;
      doc
        .fillColor(NAVY)
        .font("Helvetica-Bold")
        .fontSize(10)
        .text("APPROVED COURSE", 72, boxTop + 14);
      doc
        .font("Helvetica")
        .fontSize(12)
        .fillColor(NAVY)
        .text(input.courseTitle, 72, boxTop + 30, { width: doc.page.width - 144 });
      doc
        .moveDown(0.4)
        .fontSize(10)
        .fillColor(TEXT_MUTED)
        .text(`Course ID:  ${input.courseIdNumber}`, 72, boxTop + 56)
        .text(`CE Hours:   ${input.ceHours.toFixed(1)} hours`)
        .text(
          `Valid from ${formatDate(input.approvedAt)} through ${formatDate(input.expiresAt)}`,
        );

      doc
        .moveDown(2)
        .font("Helvetica")
        .fontSize(11)
        .fillColor(TEXT_MID)
        .text(
          `An attendee QR code accompanies this letter. Display or distribute it so attendees can complete the course quiz and claim their CE certificate.`,
          { lineGap: 4 },
        );

      // Signature
      doc.moveDown(2);
      doc.fillColor(NAVY).font("Helvetica").fontSize(11).text("Sincerely,");
      doc.moveDown(2);
      doc
        .font("Helvetica-Bold")
        .text(input.reviewerName ?? "AADB Accreditation Review");
      doc.font("Helvetica").fontSize(10).fillColor(TEXT_MUTED).text(
        "American Association of Dental Boards",
      );

      // Footer
      doc
        .fontSize(9)
        .fillColor(TEXT_MUTED)
        .text(
          "Dental ACE · AADB Continuing Education Program · dentalace.org · info@dentalace.org",
          56,
          doc.page.height - 64,
          { align: "center", width: doc.page.width - 112 },
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
