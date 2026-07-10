import "server-only";
import PDFDocument from "pdfkit";
import { drawAadbSeal } from "./seal";
import { renderScriptSignaturePng } from "./signature-image";
import { courseFormatLabel } from "./course-format-label";

/*
  PDFKit-rendered approval letter. Generates a single-page US Letter with
  navy header, gold accent rule, a numeric "Date:" line (top-right), the intro,
  the gray APPROVED COURSE callout, the AADB ACE-Program disclaimer, the
  attendee link/QR + marketing-logo note, a certificate-bundle purchase prompt,
  the president signature, and an AADB office-address footer.

  Copy is the AADB-authored language (2026-07): the disclaimer directs
  questions to info@dentalboards.org (the AADB org email, distinct from the
  DentalACE info@dentalace.org), and the footer carries the AADB Chicago + DC
  office addresses. Layout is deliberately compact so the added copy stays on a
  single page across the range of course titles / names / titles the tests
  exercise (see approval-letter.test.ts).

  Returns a Buffer ready for upload to Supabase Storage. No external assets
  needed (typography is system + PDFKit's default fonts).
*/

export type ApprovalLetterInput = {
  companyName: string;
  courseTitle: string;
  courseIdNumber: string;
  ceHours: number;
  // Provider-declared course format; printed as the "Course Format" line in the
  // APPROVED COURSE block (mapped through courseFormatLabel). Omitted when null.
  deliveryMethod?: string | null;
  approvedAt: Date;
  expiresAt: Date;
  presidentName: string;
  presidentTitle: string;
  // Uploaded signature bytes; when absent, the president name is drawn in the
  // embedded script font as the signature.
  signatureImage?: Buffer | null;
};

export async function renderApprovalLetterPdf(
  input: ApprovalLetterInput,
): Promise<Buffer> {
  // The signature is always an image: the uploaded one, or a script-font
  // rendering of the president name (canvas -> PNG, no pdfkit custom fonts).
  const signatureImage =
    input.signatureImage ?? (await renderScriptSignaturePng(input.presidentName));
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
      // Content column: 56pt margins on both sides of a 612pt-wide LETTER page.
      const CONTENT_W = doc.page.width - 112;

      // Header bar
      doc.rect(0, 0, doc.page.width, 96).fill(NAVY);
      doc
        .fillColor("#FFFFFF")
        .font("Times-Bold")
        .fontSize(28)
        .text("Dental", 56, 36, { continued: true })
        .fillColor("#E4C060")
        .text("ACE");
      doc
        .fillColor("#FFFFFF", 0.55)
        .font("Helvetica")
        .fontSize(10)
        .text("AADB Accredited Continuing Education Program", 56, 70)
        .fillOpacity(1);

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
        .text("Letter of Accreditation", 56, 134);

      // Date (numeric, top-right) per AADB.
      doc
        .font("Helvetica")
        .fontSize(11)
        .fillColor(TEXT_MUTED)
        .text(`Date: ${formatDateNumeric(input.approvedAt)}`, 56, 140, {
          align: "right",
          width: CONTENT_W,
        });

      // Recipient
      doc
        .moveDown(1.2)
        .fontSize(12)
        .fillColor(NAVY)
        .text(`Dear ${input.companyName},`, 56);

      // Intro (single sentence; the prior "This accreditation entitles you..."
      // sentence was removed per AADB).
      doc
        .moveDown(0.4)
        .font("Helvetica")
        .fontSize(10.5)
        .fillColor(TEXT_MID)
        .text(
          `Following review by the American Association of Dental Boards (AADB), we are pleased to confirm that your continuing-education course has been approved and is now accredited under the DentalACE program.`,
          { align: "left", lineGap: 3 },
        );

      // Course detail box ("gray box is good" per client).
      // PDFKit's .rect().fill() does NOT advance doc.y, so capture the rect's
      // top BEFORE drawing it and place subsequent text relative to that anchor.
      // The box grows by one line-height when a Course Format line is present so
      // the "Valid from" line can never spill past the fill.
      const formatLabel = courseFormatLabel(input.deliveryMethod);
      doc.moveDown(0.8);
      const boxTop = doc.y;
      const boxHeight = formatLabel ? 114 : 96;
      doc.rect(56, boxTop, CONTENT_W, boxHeight).fill("#F4F7FB");
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
        .fontSize(10)
        .fillColor(TEXT_MUTED)
        .text(`Course ID:  ${input.courseIdNumber}`, 72, boxTop + 56)
        .text(`CE Hours:   ${input.ceHours.toFixed(1)} hours`);
      if (formatLabel) {
        doc.text(`Course Format:  ${formatLabel}`);
      }
      doc.text(
        `Valid from ${formatDate(input.approvedAt)} through ${formatDate(input.expiresAt)}`,
      );
      // Advance the cursor past the box so subsequent moveDown() lands below it.
      doc.y = boxTop + boxHeight + 10;

      // AADB ACE-Program disclaimer (per AADB). Questions go to the AADB org
      // email (info@dentalboards.org), NOT the DentalACE info@dentalace.org.
      doc
        .moveDown(0.6)
        .font("Helvetica")
        .fontSize(10.5)
        .fillColor(TEXT_MID)
        .text(
          `The ACE Program is a service of the AADB to assist dental boards in identifying quality continuing education courses to help protect the public. ACE accreditation does not imply acceptance of credit hours by boards of dentistry. Questions or comments can be directed to the American Association of Dental Boards at info@dentalboards.org.`,
          56,
          doc.y,
          { width: CONTENT_W, lineGap: 3 },
        );

      // Attendee link + QR + marketing logo note (revised per AADB).
      doc
        .moveDown(0.5)
        .text(
          `An attendee link and QR code accompanies this letter in your dashboard. A customized logo to support the marketing of the course is also included. Distribute the attendee link and/or QR code so attendees can complete the course quiz and claim their CE certificate.`,
          { width: CONTENT_W, lineGap: 3 },
        );

      // Certificate-bundle purchase prompt (new per AADB).
      doc
        .moveDown(0.5)
        .text(
          `At this time, you will want to go in and purchase your certificate bundles in your dashboard. Please let us know if you have any questions or need anything further, and our team can jump on a quick call to walk you through that process.`,
          { width: CONTENT_W, lineGap: 3 },
        );

      // Signatory block: the AADB president signs the letter. It flows directly
      // after the body copy (rather than a fixed y) so the added paragraphs push
      // it down naturally; the compact spacing above keeps it, the seal, and the
      // footer on a single page. `signatureImage` is the uploaded signature or a
      // script-font rendering of the president name (resolved above).
      doc.moveDown(1);
      const sigBlockTop = doc.y;
      doc
        .fillColor(NAVY)
        .font("Helvetica")
        .fontSize(11)
        .text("Sincerely,", 56, sigBlockTop);

      const sigGraphicTop = sigBlockTop + 18;
      // Height clamped so a tall uploaded image can never push content to page 2.
      doc.image(signatureImage, 56, sigGraphicTop, { fit: [210, 40] });

      // Typed name + title beneath the signature graphic. Width clamped and
      // line-breaking disabled so a long but schema-valid name/title can never
      // wrap to a second line and collide with the seal/footer (single-page
      // invariant). width 400 keeps the text clear of the seal (near x=464).
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(NAVY)
        .text(input.presidentName, 56, sigGraphicTop + 46, {
          width: 400,
          lineBreak: false,
        });
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(TEXT_MUTED)
        .text(input.presidentTitle, 56, sigGraphicTop + 61, {
          width: 400,
          lineBreak: false,
        });

      // Accreditation seal, to the right of the signature block.
      drawAadbSeal(doc, { cx: doc.page.width - 110, cy: 648, r: 38 });

      // Footer: AADB org line + Chicago/DC office addresses (per AADB). Three
      // short centered lines, all above the bottom-margin line
      // (page.height - 56 = 736 on LETTER); drawing below it makes PDFKit
      // auto-paginate (the original clipping bug). No em dashes.
      // y positions are kept above the 736 bottom-margin line so PDFKit does not
      // auto-paginate the last line: the DC line at 721 + its ~11.5pt line
      // height clears 736 with margin. There is ample white space above (the
      // signatory block ends well before this), so pulling the block up is safe.
      const footerWidth = CONTENT_W;
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor(TEXT_MID)
        .text("American Association of Dental Boards", 56, 699, {
          align: "center",
          width: footerWidth,
          lineBreak: false,
        });
      doc
        .font("Helvetica")
        .fontSize(8.5)
        .fillColor(TEXT_MUTED)
        .text(
          "Chicago Office: 200 East Randolph St. STE 5100 Chicago, IL 60601",
          56,
          710,
          { align: "center", width: footerWidth, lineBreak: false },
        )
        .text(
          "DC Office: 1701 Pennsylvania AVE NW, STE 200 Washington, DC 20006",
          56,
          721,
          { align: "center", width: footerWidth, lineBreak: false },
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

function formatDateNumeric(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}
