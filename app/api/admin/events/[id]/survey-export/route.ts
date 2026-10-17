import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { surveyExportResponse } from "@/lib/events/survey-export-response";

export const runtime = "nodejs";

/*
  Admin CSV of any event's attendee survey responses (the "Download responses"
  link in the Events section of /admin/companies/[id]). Same shape as the
  company export (app/api/company/events/[id]/survey-export); 404 unless the
  event's company has event surveys switched on.
*/

const paramsSchema = z.object({ id: z.guid() });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireStaff("ADMIN");
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }

  const event = await prisma.event.findUnique({
    where: { id: parsed.data.id },
    select: { id: true, name: true, survey: true, company: { select: { surveyEnabled: true } } },
  });
  if (!event || !event.company.surveyEnabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return surveyExportResponse(event);
}
