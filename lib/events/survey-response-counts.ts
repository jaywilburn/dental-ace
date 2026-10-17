import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/*
  How many attendees answered each event's survey, for the company Survey tab
  and the admin Event surveys list.

  Counted as DISTINCT attendee emails with stored answers, not certificate
  rows: a failed attempt and its retake each carry answers, and the CSV export
  has one row per email, so a row count would not match the download.
  Emails are stored lowercased (lib/attend/event-actions.ts).

  AnyNull excludes both SQL NULL (no survey shown) and a JSON null.
*/

/** "This attempt stored survey answers", shared with the CSV export (survey-export-response.ts). */
export const HAS_SURVEY_RESPONSES = { not: Prisma.AnyNull };

export async function surveyResponseCounts(
  eventIds: readonly string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (eventIds.length === 0) return counts;
  const rows = await prisma.issuedCertificate.groupBy({
    by: ["eventId", "attendeeEmail"],
    where: { eventId: { in: [...eventIds] }, surveyResponses: HAS_SURVEY_RESPONSES },
  });
  for (const r of rows) {
    if (r.eventId) counts.set(r.eventId, (counts.get(r.eventId) ?? 0) + 1);
  }
  return counts;
}
