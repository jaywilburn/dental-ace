import "server-only";
import PDFDocument from "pdfkit";
import { drawAadbSeal } from "./seal";
import { courseFormatLabel } from "./course-format-label";
import { formatCeHours } from "@/lib/attend/format-ce-hours";

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
  /**
   * CE hours per session, index-aligned with `sessions`. When present and the
   * same length, each session prints as "Title (1 CE hour)"; otherwise titles
   * print alone (older callers / mismatched input never mislabel a session).
   */
  sessionHours?: number[];
  deliveryMethod?: string | null;
  licenseNumber?: string | null;
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
          `${formatCeHours(input.ceHours)} · Completed ${formatDate(input.completedAt)}`,
          0,
          304,
          { align: "center" },
        );

      // Optional rows below the CE hours line stack downward from y=326 so the
      // format / license / sessions lines never overlap, whichever are present.
      // The layout here is tighter than the course cert's, and everything must
      // stay above the seal (cy=430, r=38, top edge y=392).
      let rowY = 326;

      // Course Format line, matching the standard cert (lib/pdf/certificate.ts):
      // centered, TEXT_MID, Helvetica 12, sitting just below the CE hours line.
      // License number only when the attendee supplied one.
      const formatLabel = courseFormatLabel(input.deliveryMethod);
      const licenseNumber = input.licenseNumber?.trim();
      const hasSessions = !!input.sessions && input.sessions.length > 0;
      const formatText = formatLabel ? `Course Format: ${formatLabel}` : null;
      const licenseText = licenseNumber ? `License No. ${licenseNumber}` : null;
      doc.fillColor(TEXT_MID).font("Helvetica").fontSize(12);
      if (hasSessions && formatText && licenseText) {
        // With a sessions list to fit, share one row so the list (now with
        // per-session hours) keeps enough height above the seal.
        doc.text(`${formatText} · ${licenseText}`, 0, rowY, { align: "center" });
        rowY += 20;
      } else {
        if (formatText) {
          doc.text(formatText, 0, rowY, { align: "center" });
          rowY += 22;
        }
        // Slightly tighter spacing (+20) than the format row.
        if (licenseText) {
          doc.text(licenseText, 0, rowY, { align: "center" });
          rowY += 20;
        }
      }

      if (hasSessions && input.sessions) {
        // Drop below the format/license lines when present so they never
        // overlap, and shrink (then clip) so the list never reaches the seal.
        const text = sessionsLine(input.sessions, input.sessionHours);
        const top = rowY + 2;
        const fit = fitSessionsText(doc, text, SESSIONS_WIDTH(W), SEAL_TOP - SEAL_GAP - top);
        doc
          .fillColor(TEXT_MUTED)
          .font("Helvetica")
          .fontSize(fit.fontSize)
          .text(text, (W - SESSIONS_WIDTH(W)) / 2, top, {
            align: "center",
            width: SESSIONS_WIDTH(W),
            ...(fit.clip ? { height: SEAL_TOP - SEAL_GAP - top, ellipsis: true } : {}),
          });
      }

      drawAadbSeal(doc, { cx: W / 2, cy: SEAL_CY, r: SEAL_R });

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

const SEAL_CY = 430;
const SEAL_R = 38;
/** Top edge of the seal; nothing above it may cross this y. */
export const SEAL_TOP = SEAL_CY - SEAL_R;
const SEAL_GAP = 4;
const SESSIONS_WIDTH = (pageWidth: number) => pageWidth - 144;
const SESSIONS_FONT_MAX = 9.5;
const SESSIONS_FONT_MIN = 6;

/**
 * "Sessions completed: A (1 CE hour) · B (1.5 CE hours)". Hours are appended
 * only when `hours` is index-aligned with `names` (same length).
 */
export function sessionsLine(names: string[], hours?: number[]): string {
  const aligned = hours && hours.length === names.length;
  const parts = names.map((n, i) => (aligned ? `${n} (${formatCeHours(hours[i])})` : n));
  return `Sessions completed: ${parts.join(" · ")}`;
}

/**
 * Largest Helvetica size (9.5pt down to 6pt, half-point steps) at which the
 * sessions text fits in `maxHeight`. If even the minimum does not fit, returns
 * the minimum with clip=true so the caller bounds the box (PDFKit ellipsis).
 */
export function fitSessionsText(
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
  maxHeight: number,
): { fontSize: number; clip: boolean } {
  doc.font("Helvetica");
  for (let size = SESSIONS_FONT_MAX; size >= SESSIONS_FONT_MIN; size -= 0.5) {
    doc.fontSize(size);
    if (doc.heightOfString(text, { width, align: "center" }) <= maxHeight) {
      return { fontSize: size, clip: false };
    }
  }
  return { fontSize: SESSIONS_FONT_MIN, clip: true };
}

function formatDate(d: Date): string {
  // completedAt is stored at noon UTC; format in UTC so the calendar date on
  // the certificate never shifts with the render host's timezone.
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}
