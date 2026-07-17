import "server-only";
import PDFDocument from "pdfkit";
import { drawAadbSeal } from "./seal";
import { courseFormatLabel } from "./course-format-label";

/*
  PDFKit-rendered completion certificate (landscape). Mirrors the approval
  letter renderer (lib/pdf/approval-letter.ts) for brand consistency: navy +
  gold, no em dashes, system/PDFKit fonts only. Visual reference is
  ACE_Certificate.pdf; this is the PDFKit interpretation, not an exact mirror
  (intentional deviation from SOW §10 — no headless Chromium).
*/

export type CertificateInput = {
  attendeeName: string;
  courseTitle: string;
  courseIdNumber: string;
  certificateId: string;
  ceHours: number;
  completedAt: Date;
  deliveryMethod?: string | null;
  licenseNumber?: string | null;
};

export async function renderCertificatePdf(
  input: CertificateInput,
): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "LETTER", layout: "landscape", margin: 0 });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const NAVY = "#0B1A2E";
      const GOLD = "#C8971A";
      const TEXT_MID = "#344E6E";
      const TEXT_MUTED = "#6B87A8";
      const W = doc.page.width;
      const H = doc.page.height;

      doc.rect(24, 24, W - 48, H - 48).lineWidth(3).strokeColor(GOLD).stroke();
      doc.rect(32, 32, W - 64, H - 64).lineWidth(1).strokeColor(NAVY).stroke();

      // Two-color brand mark. PDFKit miscenters `continued` segments under
      // align:"center", so measure both halves and place them at an absolute,
      // manually-centered x to render "DentalACE" as one word (ACE in gold).
      doc.font("Times-Bold").fontSize(30);
      const brandWidth =
        doc.widthOfString("Dental") + doc.widthOfString("ACE");
      doc
        .fillColor(NAVY)
        .text("Dental", (W - brandWidth) / 2, 70, { continued: true })
        .fillColor(GOLD)
        .text("ACE");
      doc
        .fillColor(TEXT_MUTED)
        .font("Helvetica")
        .fontSize(11)
        .text("AADB Accredited Continuing Education Program", 0, 112, {
          align: "center",
          width: W,
        });

      doc
        .fillColor(NAVY)
        .font("Times-Bold")
        .fontSize(20)
        .text("Certificate of Completion", 0, 150, { align: "center" });

      doc
        .fillColor(TEXT_MID)
        .font("Helvetica")
        .fontSize(12)
        .text("This certifies that", 0, 195, { align: "center" });

      doc
        .fillColor(NAVY)
        .font("Times-Bold")
        .fontSize(26)
        .text(input.attendeeName, 0, 218, { align: "center" });

      doc
        .fillColor(TEXT_MID)
        .font("Helvetica")
        .fontSize(12)
        .text("has successfully completed the accredited course", 0, 258, { align: "center" });

      doc
        .fillColor(NAVY)
        .font("Times-Bold")
        .fontSize(16)
        .text(input.courseTitle, 72, 282, { align: "center", width: W - 144 });

      doc
        .fillColor(TEXT_MID)
        .font("Helvetica")
        .fontSize(12)
        .text(
          `${input.ceHours.toFixed(1)} CE hours · Completed ${formatDate(input.completedAt)}`,
          0,
          322,
          { align: "center" },
        );

      const formatLabel = courseFormatLabel(input.deliveryMethod);
      if (formatLabel) {
        doc
          .fillColor(TEXT_MID)
          .font("Helvetica")
          .fontSize(12)
          .text(`Course Format: ${formatLabel}`, 0, 344, { align: "center" });
      }

      // License number, only when the attendee supplied one. Sits below the
      // Course Format line (or takes its slot when the format is absent);
      // either way it stays clear of the seal (cy=440, r=40, top edge y=400).
      const licenseNumber = input.licenseNumber?.trim();
      if (licenseNumber) {
        doc
          .fillColor(TEXT_MID)
          .font("Helvetica")
          .fontSize(12)
          .text(`License No. ${licenseNumber}`, 0, formatLabel ? 366 : 344, {
            align: "center",
          });
      }

      drawAadbSeal(doc, { cx: W / 2, cy: 440, r: 40 });

      doc
        .fillColor(TEXT_MUTED)
        .font("Helvetica")
        .fontSize(10)
        .text(`Course ID: ${input.courseIdNumber}`, 56, H - 70, { align: "left" });
      doc
        .fillColor(TEXT_MUTED)
        .font("Helvetica")
        .fontSize(10)
        .text(`Certificate ID: ${input.certificateId}`, 0, H - 70, {
          align: "right",
          width: W - 56,
        });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function formatDate(d: Date): string {
  // completedAt is stored at noon UTC; format in UTC so the calendar date on
  // the certificate never shifts with the render host's timezone.
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}
