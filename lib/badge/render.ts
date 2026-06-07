import "server-only";
import { existsSync } from "node:fs";

/*
  Renders the per-course ACE marketing badge as a PNG by screenshotting a
  self-contained branded HTML card. Reuses the puppeteer-core + @sparticuz/chromium
  launch pattern from app/api/protrack/export/route.ts (serverless chromium +
  local fallback). No external assets, no em dashes.
*/

export type AceBadgeInput = {
  courseIdNumber: string;
  courseTitle: string;
  approvedAt: Date;
};

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
  const approved = input.approvedAt.toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
  const safeTitle = input.courseTitle.replace(/[<>&]/g, "");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box;font-family:Georgia,'Times New Roman',serif}
    body{width:600px;height:600px;display:flex;align-items:center;justify-content:center;background:#0B1A2E}
    .card{width:520px;height:520px;border:4px solid #C8971A;border-radius:18px;display:flex;flex-direction:column;
      align-items:center;justify-content:center;text-align:center;padding:40px;color:#fff}
    .brand{font-size:40px;font-weight:bold}.brand span{color:#C8971A}
    .seal{margin:18px 0;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#C8971A}
    .title{font-size:20px;margin:14px 0;color:#E6EDF5}
    .meta{font-size:13px;color:#6B87A8;margin-top:10px}
  </style></head><body><div class="card">
    <div class="brand">Dental<span>ACE</span></div>
    <div class="seal">Accredited Continuing Education</div>
    <div class="title">${safeTitle}</div>
    <div class="meta">Course ID ${input.courseIdNumber}</div>
    <div class="meta">Approved ${approved}</div>
  </div></body></html>`;
}

export async function renderAceBadgePng(input: AceBadgeInput): Promise<Buffer> {
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
    const bytes = await page.screenshot({ type: "png" });
    return Buffer.from(bytes as Uint8Array);
  } finally {
    await browser.close();
  }
}
