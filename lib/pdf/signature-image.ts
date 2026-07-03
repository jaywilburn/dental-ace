import "server-only";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { SIGNATURE_FONT_BASE64 } from "./fonts/signature-font";

/*
  Renders a president's name as a script "signature" PNG using @napi-rs/canvas
  (native, serverless-safe) with the embedded Great Vibes font. This mirrors the
  marketing-logo path (lib/badge/render.ts): draw text on a canvas, export a
  PNG, then let pdfkit place it with doc.image(). We deliberately avoid pdfkit
  custom fonts — the repo's only proven font-embedding path is the canvas one,
  and the serverless bundle already ships @napi-rs/canvas.

  Transparent background; navy ink. The letter scales this to fit, so the pixel
  size only sets resolution/aspect, not final placement.
*/

const NAVY = "#0B1A2E";
const FONT_PX = 72;

let fontRegistered = false;
function ensureFont(): void {
  if (fontRegistered) return;
  GlobalFonts.register(Buffer.from(SIGNATURE_FONT_BASE64, "base64"), "SignatureScript");
  fontRegistered = true;
}

export async function renderScriptSignaturePng(name: string): Promise<Buffer> {
  ensureFont();
  const text = name.trim() || " ";

  // Measure on a scratch context to size the canvas to the text.
  const scratch = createCanvas(10, 10).getContext("2d");
  scratch.font = `${FONT_PX}px SignatureScript`;
  const width = Math.max(1, Math.ceil(scratch.measureText(text).width) + 24);
  const height = FONT_PX + 48; // headroom for script ascenders/descenders

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.font = `${FONT_PX}px SignatureScript`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = NAVY;
  ctx.fillText(text, 12, height / 2);

  return await canvas.encode("png");
}
