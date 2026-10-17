import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { surveyExportResponse } from "@/lib/events/survey-export-response";

export const runtime = "nodejs";

/*
  CSV of an event's attendee survey responses for the OWNING company (the
  "Download responses" link on the event's Survey tab). One row per attendee
  (lib/events/survey-export.ts). 404 unless the event belongs to the caller's
  company and the company has event surveys switched on; RLS remains the floor
  underneath. The admin twin is app/api/admin/events/[id]/survey-export.
*/

const paramsSchema = z.object({ id: z.guid() });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireDentalAce();
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }
  if (!user.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const event = await prisma.event.findFirst({
    where: { id: parsed.data.id, companyId: user.companyId },
    select: { id: true, name: true, survey: true, company: { select: { surveyEnabled: true } } },
  });
  if (!event || !event.company.surveyEnabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return surveyExportResponse(event);
}
