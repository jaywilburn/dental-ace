import { NextResponse, type NextRequest } from "next/server";
import { existsSync } from "node:fs";
import { VerificationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { uploadToStorage } from "@/lib/storage";
import { requireProtrackPro } from "@/lib/protrack/require-pro";
import { licenseTypeLong, stateName } from "@/lib/protrack/reference";
import {
  computeRequirementProgress,
  formatHours,
  parseCategories,
} from "@/lib/protrack/progress";
import { renderExportHtml, type ExportData } from "@/lib/protrack/export-html";

/*
  Audit-ready CE report. Pro-gated (requireProtrackPro redirects FREE licensees).
  Renders the board-formatted HTML to PDF with Puppeteer — serverless Chromium on
  Vercel, a local Chrome install in dev — streams it back as a download, and
  persists a copy to the private uploads bucket. `?format=html` (dev only) returns
  the raw HTML for inspection.
*/

export const runtime = "nodejs";
export const maxDuration = 60;

const VERIFIED_LABEL: Record<VerificationStatus, string> = {
  AUTO: "Auto (ACE)",
  ADA_CERP_ACCEPTED: "ADA CERP",
  AGD_PACE_ACCEPTED: "AGD PACE",
  ADMIN_VERIFIED: "Verified",
  PENDING: "Pending",
};

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

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

async function renderPdf(html: string): Promise<Buffer> {
  const puppeteer = (await import("puppeteer-core")).default;
  const onServerless = !!(
    process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL
  );

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
    await page.setContent(html, { waitUntil: "load" });
    const bytes = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return Buffer.from(bytes);
  } finally {
    await browser.close();
  }
}

export async function GET(request: NextRequest) {
  const user = await requireProtrackPro();

  const primary = await prisma.userLicense.findFirst({
    where: { licenseeId: user.id, isPrimary: true },
    select: { state: true, licenseType: true, licenseNumber: true, renewalDate: true },
  });
  if (!primary) {
    return NextResponse.json({ error: "No license on file" }, { status: 400 });
  }
  const fullName =
    `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;

  const [requirement, certRows] = await Promise.all([
    prisma.stateRequirement.findUnique({
      where: {
        state_licenseType: { state: primary.state, licenseType: primary.licenseType },
      },
    }),
    prisma.ceCertificate.findMany({
      where: { licenseeId: user.id },
      orderBy: { completedAt: "desc" },
      select: {
        courseTitle: true,
        provider: true,
        category: true,
        hours: true,
        completedAt: true,
        verificationStatus: true,
        deliveryFormat: true,
      },
    }),
  ]);

  const progress = requirement
    ? computeRequirementProgress(
        {
          totalHours: Number(requirement.totalHours),
          categories: parseCategories(requirement.categories),
        },
        certRows.map((c) => ({
          category: c.category,
          hours: Number(c.hours),
          deliveryFormat: c.deliveryFormat,
        })),
      )
    : null;

  const data: ExportData = {
    fullName,
    state: stateName(primary.state),
    licenseType: licenseTypeLong(primary.licenseType),
    licenseNumber: primary.licenseNumber,
    renewalDate: dateFmt.format(primary.renewalDate),
    generatedAt: dateFmt.format(new Date()),
    totalCompleted: progress ? formatHours(progress.totalCompleted) : "0",
    totalRequired: progress ? formatHours(progress.totalRequired) : "N/A",
    remaining: progress ? formatHours(progress.remaining) : "N/A",
    isComplete: progress ? progress.status === "complete" : false,
    certs: certRows.map((c) => ({
      courseTitle: c.courseTitle,
      provider: c.provider,
      category: c.category,
      hours: formatHours(Number(c.hours)),
      date: dateFmt.format(c.completedAt),
      verified: VERIFIED_LABEL[c.verificationStatus],
    })),
    gaps: progress
      ? progress.categories.filter((c) => c.needed > 0).map((c) => c.name)
      : [],
  };

  const html = renderExportHtml(data);

  if (
    request.nextUrl.searchParams.get("format") === "html" &&
    process.env.NODE_ENV !== "production"
  ) {
    return new NextResponse(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  let pdf: Buffer;
  try {
    pdf = await renderPdf(html);
  } catch {
    return NextResponse.json(
      { error: "Could not generate the PDF. Please try again." },
      { status: 500 },
    );
  }

  // Persist a copy (best-effort) so it can be re-downloaded via signed URL.
  await uploadToStorage({
    kind: "uploads",
    path: `protrack/exports/${user.id}/${Date.now()}.pdf`,
    body: pdf,
    contentType: "application/pdf",
  }).catch(() => {});

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'attachment; filename="ce-compliance-report.pdf"',
    },
  });
}
