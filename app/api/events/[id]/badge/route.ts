import { NextResponse, type NextRequest } from "next/server";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { renderAceBadge, parseBadgeFormat, badgeFileMeta } from "@/lib/badge/render";

export const runtime = "nodejs";

/*
  Event marketing logo (PNG by default; the route also accepts ?format=pdf and
  ?format=jpeg/jpg). Same AADB template as the course badge, with "Event ID"
  wording. Only the owning company can fetch it, and only once the event is
  approved (it carries an event id + dates).
*/
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireDentalAce();
  const { id } = await params;

  const format = parseBadgeFormat(request.nextUrl.searchParams.get("format"));

  const event = await prisma.event.findUnique({
    where: { id },
    select: {
      companyId: true,
      status: true,
      eventIdNumber: true,
      approvedAt: true,
      expiresAt: true,
    },
  });
  if (!event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (event.companyId !== user.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (
    event.status !== "APPROVED" ||
    !event.eventIdNumber ||
    !event.approvedAt ||
    !event.expiresAt
  ) {
    return NextResponse.json(
      { error: "Marketing logo is available once the event is approved." },
      { status: 409 },
    );
  }

  let image: Buffer;
  try {
    image = await renderAceBadge(
      {
        courseIdNumber: event.eventIdNumber,
        approvedAt: event.approvedAt,
        expiresAt: event.expiresAt,
        kind: "Event",
      },
      format,
    );
  } catch (err) {
    console.error(`[event-badge] render failed (eventId=${id})`, err);
    return NextResponse.json(
      { error: "Marketing logo could not be generated. Please try again later." },
      { status: 500 },
    );
  }

  const { ext, contentType } = badgeFileMeta(format);
  return new NextResponse(new Uint8Array(image), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${event.eventIdNumber}-marketing-logo.${ext}"`,
    },
  });
}
