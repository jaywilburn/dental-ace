import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCertificateLogAccess } from "@/lib/company/credit-guards";
import { prisma } from "@/lib/prisma";
import { buildCertWhere } from "@/lib/certificates/query";

export const runtime = "nodejs";

/*
  CSV export of the company's Certificate Log. Honors the same search filter
  as the page (shared buildCertWhere) and is scoped to the caller's company;
  RLS remains the floor underneath. Capped at 10k rows.
*/

const EXPORT_CAP = 10_000;

const querySchema = z.object({ q: z.string().trim().max(200).optional() });

export async function GET(request: NextRequest) {
  // Same gate as the Certificate Log page: no credits + no issued certs
  // redirects to Buy App Credits.
  const { user } = await requireCertificateLogAccess();

  const parsed = querySchema.safeParse({
    q: request.nextUrl.searchParams.get("q") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  const query = parsed.data.q ?? "";

  const certs = await prisma.issuedCertificate.findMany({
    where: buildCertWhere(user.companyId, query),
    orderBy: { issuedAt: "desc" },
    take: EXPORT_CAP,
    select: {
      issuedAt: true,
      attendeeName: true,
      attendeeEmail: true,
      licenseType: true,
      licenseNumber: true,
      score: true,
      course: {
        select: {
          courseIdNumber: true,
          application: { select: { courseTitle: true } },
        },
      },
    },
  });

  const header = [
    "Issued At",
    "Attendee Name",
    "Attendee Email",
    "License Type",
    "License Number",
    "Course ID",
    "Course Title",
    "Score",
  ];

  const lines = [
    header.map(csvField).join(","),
    ...certs.map((cert) =>
      [
        cert.issuedAt.toISOString(),
        cert.attendeeName,
        cert.attendeeEmail,
        cert.licenseType ?? "",
        cert.licenseNumber ?? "",
        cert.course?.courseIdNumber ?? "",
        cert.course?.application?.courseTitle ?? "",
        cert.score != null ? String(cert.score) : "",
      ]
        .map(csvField)
        .join(","),
    ),
  ];

  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="certificate-log.csv"',
      "Cache-Control": "no-store",
    },
  });
}

/*
  Quote + escape a CSV field. The leading apostrophe on =,+,-,@ neutralizes
  spreadsheet formula injection — attendee names/emails are user-supplied.
*/
function csvField(value: string): string {
  let v = value;
  if (/^[=+\-@]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}
