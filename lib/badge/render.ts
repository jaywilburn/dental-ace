import "server-only";
import {
  createCanvas,
  loadImage,
  GlobalFonts,
  type SKRSContext2D,
} from "@napi-rs/canvas";
import PDFDocument from "pdfkit";
import { ACE_SEAL_DATA_URI } from "./ace-seal";
import { GEIST_REGULAR_BASE64 } from "./geist-font";

/*
  Renders the per-course/event ACE marketing logo (PNG, JPEG, or PDF) by drawing
  the client's AADB template onto a canvas: the maroon "ACE / An AADB Program"
  seal above the approval statement, the Course/Event ID, and the accreditation
  date range. No headless Chromium: the raster (PNG/JPEG) is drawn with
  @napi-rs/canvas (native, serverless-safe) and the PDF wraps that PNG with
  pdfkit (the same reliable renderer used for certificates + approval letters).
  The seal and the Geist font are both embedded as base64 (lib/badge/ace-seal.ts,
  lib/badge/geist-font.ts) so there is no external asset fetch and the serverless
  bundle always ships them. No em dashes.
*/

export type AceBadgeInput = {
  courseIdNumber: string;
  approvedAt: Date;
  expiresAt: Date;
  // "Course" (default) or "Event" — drives the wording on the logo.
  kind?: "Course" | "Event";
};

export type BadgeFormat = "png" | "jpeg" | "pdf";

// The route accepts a ?format= value; anything unrecognized falls back to PNG
// (the single visible "Marketing Logo" link downloads PNG).
export function parseBadgeFormat(raw: string | null): BadgeFormat {
  const v = (raw ?? "").toLowerCase();
  if (v === "pdf") return "pdf";
  if (v === "jpeg" || v === "jpg") return "jpeg";
  return "png";
}

export function badgeFileMeta(format: BadgeFormat): {
  ext: "png" | "jpg" | "pdf";
  contentType: string;
} {
  switch (format) {
    case "pdf":
      return { ext: "pdf", contentType: "application/pdf" };
    case "jpeg":
      return { ext: "jpg", contentType: "image/jpeg" };
    default:
      return { ext: "png", contentType: "image/png" };
  }
}

let fontRegistered = false;
function ensureFont(): void {
  if (fontRegistered) return;
  GlobalFonts.register(Buffer.from(GEIST_REGULAR_BASE64, "base64"), "Geist");
  fontRegistered = true;
}

const CENTER = 300; // horizontal center in the 600-unit design space
const BODY = "#262626";
const MAROON = "#571516";

function setFont(ctx: SKRSContext2D, size: number): void {
  ctx.font = `${size}px Geist`;
}

// The AADB template is entirely bold. We only bundle Geist Regular, so bold is
// faked by stroking each glyph in its own fill color (a hairline thickens the
// strokes). lineWidth is in the 600-unit design space (2x on the device canvas).
function centeredBold(
  ctx: SKRSContext2D,
  text: string,
  y: number,
  color: string,
  letterSpacing = 0,
): void {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.6;
  ctx.lineJoin = "round";

  if (letterSpacing <= 0) {
    ctx.textAlign = "center";
    ctx.fillText(text, CENTER, y);
    ctx.strokeText(text, CENTER, y);
    return;
  }

  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total =
    widths.reduce((a, b) => a + b, 0) + letterSpacing * (chars.length - 1);
  let x = CENTER - total / 2;
  ctx.textAlign = "left";
  chars.forEach((ch, i) => {
    ctx.fillText(ch, x, y);
    ctx.strokeText(ch, x, y);
    x += widths[i] + letterSpacing;
  });
  ctx.textAlign = "center";
}

function wrapLines(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (cur && ctx.measureText(test).width > maxWidth) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

async function drawBadge(
  ctx: SKRSContext2D,
  input: AceBadgeInput,
): Promise<void> {
  ensureFont();

  const kind = input.kind ?? "Course";
  const kindLower = kind.toLowerCase();
  const dateOpts = {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  } as const;
  const from = input.approvedAt.toLocaleDateString("en-US", dateOpts);
  const to = input.expiresAt.toLocaleDateString("en-US", dateOpts);
  const safeId = input.courseIdNumber.replace(/[<>&]/g, "");

  // Background matches the original card (#D9D9D9), opaque so JPEG is clean.
  ctx.fillStyle = "#D9D9D9";
  ctx.fillRect(0, 0, 600, 600);

  ctx.textBaseline = "top";
  ctx.textAlign = "center";

  let y = 30; // padding-top

  // Seal (264px wide, aspect preserved), centered near the top.
  y += 4; // .seal margin-top
  const sealB64 = ACE_SEAL_DATA_URI.split(",")[1] ?? "";
  const seal = await loadImage(Buffer.from(sealB64, "base64"));
  const sealW = 264;
  const sealH = sealW * (seal.height / seal.width);
  ctx.drawImage(seal, CENTER - sealW / 2, y, sealW, sealH);
  y += sealH;

  // Approval statement, wrapped to the card width (max-width:500px).
  y += 26;
  setFont(ctx, 17.5);
  const approveLh = 17.5 * 1.34;
  const approve =
    "The content of this course has been approved by the American Association of Dental Boards.";
  for (const line of wrapLines(ctx, approve, 500)) {
    centeredBold(ctx, line, y, BODY);
    y += approveLh;
  }

  // ID label.
  y += 22;
  setFont(ctx, 16.5);
  centeredBold(ctx, `The ${kind} ID for this ${kind} is:`, y, BODY);
  y += 16.5;

  // ID value (maroon, lightly letter-spaced).
  y += 7;
  setFont(ctx, 23);
  centeredBold(ctx, safeId, y, MAROON, 1);
  y += 23;

  // Accreditation window label.
  y += 22;
  setFont(ctx, 16.5);
  centeredBold(
    ctx,
    `This content of this ${kindLower} is accredited from:`,
    y,
    BODY,
  );
  y += 16.5;

  // Dates.
  y += 7;
  setFont(ctx, 18);
  centeredBold(ctx, `${from} - ${to}`, y, BODY);
}

// Wrap the rendered PNG in a square PDF with pdfkit (same reliable path as the
// certificate/approval-letter renderers). 600pt square, image edge-to-edge.
function pngToPdf(png: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: [600, 600], margin: 0 });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      doc.image(png, 0, 0, { width: 600, height: 600 });
      doc.end();
    } catch (err) {
      reject(err as Error);
    }
  });
}

export async function renderAceBadge(
  input: AceBadgeInput,
  format: BadgeFormat = "png",
): Promise<Buffer> {
  // Render at 2x (1200x1200 device) for crisp output; draw in the 600-unit space.
  const canvas = createCanvas(1200, 1200);
  const ctx = canvas.getContext("2d");
  ctx.scale(2, 2);
  await drawBadge(ctx, input);

  if (format === "png") return await canvas.encode("png");
  if (format === "jpeg") return await canvas.encode("jpeg", 92);
  const png = await canvas.encode("png");
  return await pngToPdf(png);
}
