import "server-only";
import PDFDocument from "pdfkit";
import { drawAadbSeal } from "./seal";
import { courseFormatLabel } from "./course-format-label";

/*
  Event completion certificate (landscape). Sibling of lib/pdf/certificate.ts;
  the course renderer is left untouched. One certificate per event: shows the
  event name, total/attended hours, completion date, and (for selective events)
  the list of sessions the attendee completed.
*/

export type EventCertificateInput = {
  attendeeName: string;
  eventName: string;
  eventIdNumber: string;
  certificateId: string;
  ceHours: number;
  completedAt: Date;
  sessions?: string[]; // attended session/course names (Opt 3/4)
  deliveryMethod?: string | null;
};

export async function renderEventCertificatePdf(
  input: EventCertificateInput,
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

      doc.font("Times-Bold").fontSize(30);
      const brandWidth = doc.widthOfString("Dental") + doc.widthOfString("ACE");
      doc
        .fillColor(NAVY)
        .text("Dental", (W - brandWidth) / 2, 64, { continued: true })
        .fillColor(GOLD)
        .text("ACE");
      doc
        .fillColor(TEXT_MUTED)
        .font("Helvetica")
        .fontSize(11)
        .text("AADB Accredited Continuing Education Program", 0, 106, { align: "center", width: W });

      doc
        .fillColor(NAVY)
        .font("Times-Bold")
        .fontSize(20)
        .text("Certificate of Completion", 0, 142, { align: "center" });

      doc
        .fillColor(TEXT_MID)
        .font("Helvetica")
        .fontSize(12)
        .text("This certifies that", 0, 184, { align: "center" });

      doc
        .fillColor(NAVY)
        .font("Times-Bold")
        .fontSize(26)
        .text(input.attendeeName, 0, 205, { align: "center" });

      doc
        .fillColor(TEXT_MID)
        .font("Helvetica")
        .fontSize(12)
        .text("has successfully completed the accredited event", 0, 244, { align: "center" });

      doc
        .fillColor(NAVY)
        .font("Times-Bold")
        .fontSize(16)
        .text(input.eventName, 72, 266, { align: "center", width: W - 144 });

      doc
        .fillColor(TEXT_MID)
        .font("Helvetica")
        .fontSize(12)
        .text(
          `${input.ceHours.toFixed(1)} CE hours · Completed ${formatDate(input.completedAt)}`,
          0,
          304,
          { align: "center" },
        );

      // Course Format line, matching the standard cert (lib/pdf/certificate.ts):
      // centered, TEXT_MID, Helvetica 12, sitting just below the CE hours line.
      const formatLabel = courseFormatLabel(input.deliveryMethod);
      if (formatLabel) {
        doc
          .fillColor(TEXT_MID)
          .font("Helvetica")
          .fontSize(12)
          .text(`Course Format: ${formatLabel}`, 0, 326, { align: "center" });
      }

      if (input.sessions && input.sessions.length > 0) {
        // Drop below the format line when it is present so the two never overlap.
        const sessionsY = formatLabel ? 350 : 328;
        doc
          .fillColor(TEXT_MUTED)
          .font("Helvetica")
          .fontSize(9.5)
          .text(`Sessions completed: ${input.sessions.join(" · ")}`, 80, sessionsY, {
            align: "center",
            width: W - 160,
          });
      }

      drawAadbSeal(doc, { cx: W / 2, cy: 430, r: 38 });

      doc
        .fillColor(TEXT_MUTED)
        .font("Helvetica")
        .fontSize(10)
        .text(`Event ID: ${input.eventIdNumber}`, 56, H - 70, { align: "left" });
      doc
        .fillColor(TEXT_MUTED)
        .font("Helvetica")
        .fontSize(10)
        .text(`Certificate ID: ${input.certificateId}`, 0, H - 70, { align: "right", width: W - 56 });

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
