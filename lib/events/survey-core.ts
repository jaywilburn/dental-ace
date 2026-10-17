import "server-only";
import { Prisma } from "@prisma/client";
import {
  normalizeSurveyInput,
  parseStoredSurvey,
  type SurveyFieldErrors,
  type SurveyQuestion,
} from "@/lib/events/survey-schemas";

/*
  The one write path for events.survey, shared by the company and admin save
  actions (lib/events/survey-actions.ts). Callers have already checked who may
  edit and that the company has surveys on; this only turns an editor
  submission into the stored definition.

  The event row is locked first so the id-keeping check in normalizeSurveyInput
  runs against the committed survey. Without the lock, a company save and an
  admin save landing together could each keep ids the other just replaced.

  An empty survey is stored as SQL NULL ("no survey"), matching rows that
  never had one.
*/

export type SaveSurveyResult =
  | { ok: true; questions: SurveyQuestion[]; changed: boolean }
  | { ok: false; errors: SurveyFieldErrors };

export async function saveSurveyCore(
  tx: Prisma.TransactionClient,
  eventId: string,
  raw: unknown,
): Promise<SaveSurveyResult> {
  await tx.$executeRaw`select id from public.events where id = ${eventId}::uuid for update`;
  const event = await tx.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { survey: true },
  });
  const existing = parseStoredSurvey(event.survey);

  const result = normalizeSurveyInput(raw, existing);
  if (!result.ok) return result;

  const changed = JSON.stringify(existing) !== JSON.stringify(result.questions);
  if (changed) {
    await tx.event.update({
      where: { id: eventId },
      data: {
        survey:
          result.questions.length > 0
            ? (result.questions as Prisma.InputJsonValue)
            : Prisma.DbNull,
      },
    });
  }
  return { ok: true, questions: result.questions, changed };
}
