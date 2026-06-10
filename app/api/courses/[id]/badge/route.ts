import { NextResponse, type NextRequest } from "next/server";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { renderAceBadgePng } from "@/lib/badge/render";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireDentalAce();
  const { id } = await params;

  const course = await prisma.accreditedCourse.findUnique({
    where: { id },
    select: {
      companyId: true,
      courseIdNumber: true,
      approvedAt: true,
      application: { select: { courseTitle: true } },
    },
  });
  if (!course) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (course.companyId !== user.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const png = await renderAceBadgePng({
    courseIdNumber: course.courseIdNumber,
    courseTitle: course.application.courseTitle ?? "Accredited Course",
    approvedAt: course.approvedAt,
  });

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      // User-facing name is "Marketing Logo" (client feedback, 2026-06); the
      // /badge route path and render module keep the internal name.
      "Content-Disposition": `attachment; filename="${course.courseIdNumber}-marketing-logo.png"`,
    },
  });
}
