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

  Two sources, reported separately by lib/events/survey-export.ts:
  certificate attempts with answers, and No-CE survey-only submissions
  (event_survey_responses). A survey-only row never fills or replaces a
  certificate attendee's answers (it is public and unverified), so attempts
  are loaded only for emails that answered ON AN ATTEMPT. It loads EVERY
  attempt of those attendees, not only the answered rows: the reported attempt
  (passed wins) can carry no answers, and dropping it would export a passed
  attendee as "Not passed". The answered-email set uses the same
  HAS_SURVEY_RESPONSES filter as the response counts, and survey-only rows are
  deduped per email in both places, so the download has exactly as many rows
  as the count shows. Each source is capped at SURVEY_EXPORT_CAP rows.
  Both writers store attendee_email lowercased (submitEventAttendance in
  lib/attend/event-actions.ts, which issues through event-issue.ts, and
  submitEventSurveyOnly in event-survey-actions.ts), so the attempts query
  matches the stored values with a plain IN.
*/
export async function surveyExportResponse(event: {
  id: string;
  name: string;
  survey: unknown;
}): Promise<NextResponse> {
  const [answered, surveyOnly] = await Promise.all([
    prisma.issuedCertificate.findMany({
      where: { eventId: event.id, surveyResponses: HAS_SURVEY_RESPONSES },
      distinct: ["attendeeEmail"],
      take: SURVEY_EXPORT_CAP,
      select: { attendeeEmail: true },
    }),
    prisma.eventSurveyResponse.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: "desc" },
      take: SURVEY_EXPORT_CAP,
      select: { attendeeName: true, attendeeEmail: true, createdAt: true, responses: true },
    }),
  ]);

  // distinct: ["attendeeEmail"] already dedupes; the values are stored lowercased.
  const emails = answered.map((r) => r.attendeeEmail);
  const rows =
    emails.length === 0
      ? []
      : await prisma.issuedCertificate.findMany({
          where: {
            eventId: event.id,
            attendeeEmail: { in: emails },
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

  return new NextResponse(surveyExportCsv(parseStoredSurvey(event.survey), rows, surveyOnly), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${surveyExportFilename(event.name)}"`,
      "Cache-Control": "no-store",
    },
  });
}
