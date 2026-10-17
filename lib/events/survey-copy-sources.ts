import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseStoredSurvey } from "@/lib/events/survey-schemas";
import type { SurveyCopySource } from "@/lib/events/survey-copy";

/*
  Events whose survey the editor can copy from (see survey-copy.ts): the SAME
  company's other non-draft events with at least one survey question, newest
  first. Shared by the company Survey tab and the admin survey page; each
  caller has already proven the company owns `excludeEventId`.

  Capped at 50 rows so the page query stays light. The label carries the event
  date as well as the name because AADB reuses the same event name every year.
*/

const SOURCE_LIMIT = 50;

export async function surveyCopySources(
  companyId: string,
  excludeEventId: string,
): Promise<SurveyCopySource[]> {
  const rows = await prisma.event.findMany({
    where: {
      companyId,
      id: { not: excludeEventId },
      status: { not: "DRAFT" },
      survey: { not: Prisma.AnyNull },
    },
    orderBy: { createdAt: "desc" },
    take: SOURCE_LIMIT,
    select: { id: true, name: true, eventIdNumber: true, eventDate: true, survey: true },
  });

  const sources: SurveyCopySource[] = [];
  for (const row of rows) {
    const questions = parseStoredSurvey(row.survey);
    if (questions.length === 0) continue;
    const name = row.name.trim() || row.eventIdNumber || "Untitled event";
    const date = row.eventDate.trim();
    sources.push({ eventId: row.id, label: date ? `${name}, ${date}` : name, questions });
  }
  return sources;
}
