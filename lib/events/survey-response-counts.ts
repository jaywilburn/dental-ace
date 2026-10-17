import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/*
  How many attendees answered each event's survey, for the company Survey tab
  and the admin Event surveys list.

  Counted as DISTINCT attendee emails across both sources: certificate
  attempts with stored answers, and No-CE survey-only submissions
  (event_survey_responses, every row counts). Not row counts: a failed
  attempt and its retake each carry answers, an attendee may submit the
  survey-only form twice or later claim a certificate, and the CSV export has
  one row per email, so a row count would not match the download.
  Emails are stored lowercased (lib/attend/event-actions.ts,
  event-survey-actions.ts); merged lowercased here as well.

  AnyNull excludes both SQL NULL (no survey shown) and a JSON null.
*/

/** "This attempt stored survey answers", shared with the CSV export (survey-export-response.ts). */
export const HAS_SURVEY_RESPONSES = { not: Prisma.AnyNull };

/** Distinct lowercased emails per event across (eventId, email) pairs. PURE. */
export function countDistinctResponders(
  pairs: Iterable<{ eventId: string | null; attendeeEmail: string }>,
): Map<string, number> {
  const emails = new Map<string, Set<string>>();
  for (const { eventId, attendeeEmail } of pairs) {
    if (!eventId) continue;
    let set = emails.get(eventId);
    if (!set) emails.set(eventId, (set = new Set()));
    set.add(attendeeEmail.trim().toLowerCase());
  }
  return new Map([...emails].map(([id, set]) => [id, set.size]));
}

export async function surveyResponseCounts(
  eventIds: readonly string[],
): Promise<Map<string, number>> {
  if (eventIds.length === 0) return new Map();
  const [certRows, surveyOnlyRows] = await Promise.all([
    prisma.issuedCertificate.groupBy({
      by: ["eventId", "attendeeEmail"],
      where: { eventId: { in: [...eventIds] }, surveyResponses: HAS_SURVEY_RESPONSES },
    }),
    prisma.eventSurveyResponse.groupBy({
      by: ["eventId", "attendeeEmail"],
      where: { eventId: { in: [...eventIds] } },
    }),
  ]);
  return countDistinctResponders([...certRows, ...surveyOnlyRows]);
}
