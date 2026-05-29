import "server-only";
import QRCode from "qrcode";

/*
  Generates a QR code as a PNG buffer pointing to the attendee form URL.
  Used during the reviewer approve flow.
*/
export async function renderQrPng(targetUrl: string): Promise<Buffer> {
  return QRCode.toBuffer(targetUrl, {
    errorCorrectionLevel: "M",
    type: "png",
    width: 600,
    margin: 2,
    color: {
      dark: "#0B1A2E",
      light: "#FFFFFF",
    },
  });
}
