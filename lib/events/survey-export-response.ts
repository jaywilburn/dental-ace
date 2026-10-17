import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HAS_SURVEY_RESPONSES } from "@/lib/events/survey-response-counts";
import { parseStoredSurvey } from "@/lib/events/survey-schemas";
import {
  SURVEY_EXPORT_CAP,
  surveyExportCsv,
  surveyExportFilename,
} from "@/lib/events/survey-export";

/*
  The survey-responses CSV download, shared by the company and admin export
  routes (app/api/{company,admin}/events/[id]/survey-export). The routes own
  auth, ownership and the surveyEnabled flag; this loads and shapes the rows.

  It loads EVERY attempt of each attendee who answered at least once, not only
  the answered rows: the reported attempt (passed wins) can carry no answers,
  and dropping it would export a passed attendee as "Not passed". The
  answered-email set uses the same HAS_SURVEY_RESPONSES filter as the response
  counts, so the download has exactly as many rows as the count shows.
  Emails are stored lowercased (lib/attend/event-actions.ts); the attempts
  query still matches case-insensitively, like the attempts lookup there.
*/
export async function surveyExportResponse(event: {
  id: string;
  name: string;
  survey: unknown;
}): Promise<NextResponse> {
  const answered = await prisma.issuedCertificate.findMany({
    where: { eventId: event.id, surveyResponses: HAS_SURVEY_RESPONSES },
    distinct: ["attendeeEmail"],
    take: SURVEY_EXPORT_CAP,
    select: { attendeeEmail: true },
  });

  const rows =
    answered.length === 0
      ? []
      : await prisma.issuedCertificate.findMany({
          where: {
            eventId: event.id,
            attendeeEmail: { in: answered.map((r) => r.attendeeEmail), mode: "insensitive" },
          },
          orderBy: { issuedAt: "desc" },
          take: SURVEY_EXPORT_CAP,
          select: {
            attendeeName: true,
            attendeeEmail: true,
            licenseStates: true,
            passed: true,
            ceHours: true,
            issuedAt: true,
            surveyResponses: true,
          },
        });

  return new NextResponse(surveyExportCsv(parseStoredSurvey(event.survey), rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${surveyExportFilename(event.name)}"`,
      "Cache-Control": "no-store",
    },
  });
}
