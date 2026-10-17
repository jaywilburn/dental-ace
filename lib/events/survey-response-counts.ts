import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeEmailKey } from "@/lib/events/survey-export";

/*
  How many attendees answered each event's survey, for the company Survey tab
  and the admin Event surveys list.

  Matches the CSV export (lib/events/survey-export.ts), which reports the two
  sources as separate rows: DISTINCT emails among certificate attempts with
  stored answers, PLUS distinct emails among No-CE survey-only submissions
  (event_survey_responses, every row counts). Each source is deduped on its
  own and the two are summed, because a public, unverified survey-only row
  never merges into a certificate attendee's row. Not row counts: a failed
  attempt and its retake each carry answers, and an attendee may submit the
  survey-only form twice.

  AnyNull excludes both SQL NULL (no survey shown) and a JSON null.
*/

/** "This attempt stored survey answers", shared with the CSV export (survey-export-response.ts). */
export const HAS_SURVEY_RESPONSES = { not: Prisma.AnyNull };

type ResponderPair = { eventId: string | null; attendeeEmail: string };

/** Distinct emails per event within each source, summed across sources. PURE. */
export function countDistinctResponders(
  ...sources: Iterable<ResponderPair>[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const pairs of sources) {
    const emails = new Map<string, Set<string>>();
    for (const { eventId, attendeeEmail } of pairs) {
      if (!eventId) continue;
      let set = emails.get(eventId);
      if (!set) emails.set(eventId, (set = new Set()));
      set.add(normalizeEmailKey(attendeeEmail));
    }
    for (const [id, set] of emails) counts.set(id, (counts.get(id) ?? 0) + set.size);
  }
  return counts;
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
  return countDistinctResponders(certRows, surveyOnlyRows);
}
