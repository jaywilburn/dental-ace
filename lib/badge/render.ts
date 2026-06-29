import "server-only";
import { existsSync } from "node:fs";
import { ACE_SEAL_DATA_URI } from "./ace-seal";

/*
  Renders the per-course ACE marketing logo (PNG or JPEG) by screenshotting a
  self-contained branded HTML card that matches the client's AADB template:
  the maroon "ACE / An AADB Program" seal above the approval statement, the
  Course ID, and the accreditation date range. Reuses the puppeteer-core +
  @sparticuz/chromium launch pattern from app/api/protrack/export/route.ts
  (serverless chromium + local fallback). The seal is embedded as a base64 data
  URI (lib/badge/ace-seal.ts) so there is no external asset fetch. No em dashes.
*/

export type AceBadgeInput = {
  courseIdNumber: string;
  approvedAt: Date;
  expiresAt: Date;
  // "Course" (default) or "Event" — drives the wording on the logo.
  kind?: "Course" | "Event";
};

export type BadgeFormat = "png" | "jpeg";

function localChromePath(): string {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
  ].filter(Boolean) as string[];
  return candidates.find((p) => existsSync(p)) ?? "";
}

function badgeHtml(input: AceBadgeInput): string {
  const dateOpts = { month: "2-digit", day: "2-digit", year: "numeric" } as const;
  const from = input.approvedAt.toLocaleDateString("en-US", dateOpts);
  const to = input.expiresAt.toLocaleDateString("en-US", dateOpts);
  const safeId = input.courseIdNumber.replace(/[<>&]/g, "");
  const kind = input.kind ?? "Course";
  const kindLower = kind.toLowerCase();
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{width:600px;height:600px;background:#D9D9D9;color:#262626;
      font-family:Arial,Helvetica,"Segoe UI",sans-serif;
      display:flex;flex-direction:column;align-items:center;justify-content:flex-start;
      padding:30px 46px}
    .seal{width:264px;height:auto;margin-top:4px}
    .line{text-align:center;font-weight:bold;line-height:1.34}
    .approve{margin-top:26px;font-size:17.5px;max-width:500px}
    .idlabel{margin-top:22px;font-size:16.5px}
    .idval{margin-top:7px;font-size:23px;color:#571516;letter-spacing:1px}
    .accredited{margin-top:22px;font-size:16.5px}
    .dates{margin-top:7px;font-size:18px}
  </style></head><body>
    <img class="seal" src="${ACE_SEAL_DATA_URI}" alt="DentalACE Accredited Continuing Education, An AADB Program" />
    <div class="line approve">The content of this course has been approved by the American Association of Dental Boards.</div>
    <div class="line idlabel">The ${kind} ID for this ${kind} is:</div>
    <div class="line idval">${safeId}</div>
    <div class="line accredited">This content of this ${kindLower} is accredited from:</div>
    <div class="line dates">${from} - ${to}</div>
  </body></html>`;
}

export async function renderAceBadge(
  input: AceBadgeInput,
  format: BadgeFormat = "png",
): Promise<Buffer> {
  const puppeteer = (await import("puppeteer-core")).default;
  const onServerless = !!(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL);

  const browser = onServerless
    ? await (async () => {
        const chromium = (await import("@sparticuz/chromium")).default;
        return puppeteer.launch({
          args: chromium.args,
          executablePath: await chromium.executablePath(),
          headless: true,
        });
      })()
    : await puppeteer.launch({
        executablePath: localChromePath(),
        headless: true,
        args: ["--no-sandbox"],
      });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 600, height: 600, deviceScaleFactor: 2 });
    await page.setContent(badgeHtml(input), { waitUntil: "load" });
    const bytes =
      format === "jpeg"
        ? await page.screenshot({ type: "jpeg", quality: 92 })
        : await page.screenshot({ type: "png" });
    return Buffer.from(bytes as Uint8Array);
  } finally {
    await browser.close();
  }
}
