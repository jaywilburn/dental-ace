import { NextResponse, type NextRequest } from "next/server";
import { existsSync } from "node:fs";
import { ComplianceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireBoard } from "@/lib/board/scope";
import { licenseTypeLong, licenseTypeShort, stateName } from "@/lib/protrack/reference";
import {
  renderAuditExportHtml,
  type AuditExportData,
  type AuditExportSelection,
} from "@/lib/board/audits/export-html";

/*
  /board/audits/[batchId]/export — PDF export of an audit batch.

  Mirrors the ProTrack export route (lib/protrack/export-html.ts +
  app/api/protrack/export/route.ts):
   - Pulls the batch + selections (scoped to the requesting board).
   - Renders a self-contained HTML report.
   - Streams a PDF back via Puppeteer (serverless Chromium on Vercel,
     a local Chrome on dev).
   - `?format=html` is a dev-only escape hatch for inspecting the layout.

  Scope: requireBoard + boardId match on the batch — a TX board user
  cannot export a CA board's audit even by guessing the UUID.
*/

export const runtime = "nodejs";
export const maxDuration = 60;

const STATUS_LABEL: Record<
  ComplianceStatus,
  { label: string; cls: AuditExportSelection["statusClass"] }
> = {
  COMPLIANT: { label: "Compliant", cls: "ok" },
  IN_PROGRESS: { label: "In progress", cls: "progress" },
  DEFICIENT: { label: "Deficient", cls: "deficient" },
  NO_UPLOAD: { label: "No upload", cls: "no-upload" },
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { board } = await requireBoard();
  const { batchId } = await params;

  const batch = await prisma.auditBatch.findFirst({
    where: { id: batchId, boardId: board.id },
    select: {
      id: true,
      batchCode: true,
      name: true,
      samplePercent: true,
      licenseType: true,
      renewalCycle: true,
      selectedCount: true,
      deficientCount: true,
      createdAt: true,
      initiatedBy: { select: { firstName: true, lastName: true, email: true } },
    },
  });
  if (!batch) {
    return NextResponse.json({ error: "Audit batch not found" }, { status: 404 });
  }

  const selections = await prisma.auditSelection.findMany({
    where: { batchId: batch.id },
    orderBy: [{ complianceStatus: "asc" }, { createdAt: "asc" }],
    select: {
      ceHoursCompleted: true,
      ceHoursRequired: true,
      complianceStatus: true,
      userLicense: {
        select: {
          licenseNumber: true,
          licenseType: true,
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      },
    },
  });

  const counts = {
    compliant: 0,
    inProgress: 0,
    deficient: 0,
    noUpload: 0,
  };
  for (const s of selections) {
    if (s.complianceStatus === ComplianceStatus.COMPLIANT) counts.compliant += 1;
    else if (s.complianceStatus === ComplianceStatus.IN_PROGRESS) counts.inProgress += 1;
    else if (s.complianceStatus === ComplianceStatus.DEFICIENT) counts.deficient += 1;
    else if (s.complianceStatus === ComplianceStatus.NO_UPLOAD) counts.noUpload += 1;
  }

  const initiatedBy = batch.initiatedBy.firstName
    ? `${batch.initiatedBy.firstName} ${batch.initiatedBy.lastName ?? ""}`.trim()
    : batch.initiatedBy.email;

  const data: AuditExportData = {
    boardName: board.name,
    stateName: stateName(board.state),
    batchCode: batch.batchCode,
    auditName: batch.name,
    renewalCycle: batch.renewalCycle,
    licenseTypeLabel: batch.licenseType
      ? licenseTypeLong(batch.licenseType)
      : "All license types",
    samplePercent: batch.samplePercent,
    initiatedBy,
    runDate: dateFmt.format(batch.createdAt),
    generatedAt: dateFmt.format(new Date()),
    selectedCount: batch.selectedCount,
    compliantCount: counts.compliant,
    inProgressCount: counts.inProgress,
    deficientCount: counts.deficient,
    noUploadCount: counts.noUpload,
    selections: selections.map((s) => {
      const name = s.userLicense.user.firstName
        ? `${s.userLicense.user.firstName} ${s.userLicense.user.lastName ?? ""}`.trim()
        : s.userLicense.user.email;
      const status = STATUS_LABEL[s.complianceStatus];
      return {
        licenseNumber: s.userLicense.licenseNumber,
        fullName: name,
        licenseType: licenseTypeShort(s.userLicense.licenseType),
        ceHoursCompleted: Number(s.ceHoursCompleted).toFixed(1),
        ceHoursRequired: Number(s.ceHoursRequired).toFixed(1),
        status: status.label,
        statusClass: status.cls,
      };
    }),
  };

  const html = renderAuditExportHtml(data);

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
  } catch (err) {
    console.error("[verify/audit-export] pdf render failed", batch.id, err);
    return NextResponse.json(
      { error: "Could not generate the PDF. Please try again." },
      { status: 500 },
    );
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="audit-${batch.batchCode}.pdf"`,
    },
  });
}
