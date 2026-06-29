import { NextResponse, type NextRequest } from "next/server";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { renderAceBadge, type BadgeFormat } from "@/lib/badge/render";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireDentalAce();
  const { id } = await params;

  // ?format=jpeg downloads a JPEG; anything else (default) is PNG.
  const format: BadgeFormat =
    request.nextUrl.searchParams.get("format") === "jpeg" ? "jpeg" : "png";

  const course = await prisma.accreditedCourse.findUnique({
    where: { id },
    select: {
      companyId: true,
      courseIdNumber: true,
      approvedAt: true,
      expiresAt: true,
    },
  });
  if (!course) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (course.companyId !== user.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let image: Buffer;
  try {
    image = await renderAceBadge(
      {
        courseIdNumber: course.courseIdNumber,
        approvedAt: course.approvedAt,
        expiresAt: course.expiresAt,
      },
      format,
    );
  } catch (err) {
    console.error(`[badge] render failed (courseId=${id})`, err);
    return NextResponse.json(
      { error: "Marketing logo could not be generated. Please try again later." },
      { status: 500 },
    );
  }

  const ext = format === "jpeg" ? "jpg" : "png";
  return new NextResponse(new Uint8Array(image), {
    headers: {
      "Content-Type": format === "jpeg" ? "image/jpeg" : "image/png",
      // User-facing name is "Marketing Logo" (client feedback, 2026-06); the
      // /badge route path and render module keep the internal name.
      "Content-Disposition": `attachment; filename="${course.courseIdNumber}-marketing-logo.${ext}"`,
    },
  });
}
