"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AdminAuditAction } from "@prisma/client";
import { requireDentalAce, requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { recordAdminAction } from "@/lib/admin/audit";
import { saveSurveyCore } from "@/lib/events/survey-core";
import { SURVEY_FORM_KEY } from "@/lib/events/survey-schemas";
import type { SurveySaveState } from "@/lib/events/survey-save-state";

/*
  Save an event's attendee survey (events.survey) from the shared editor
  (components/events/survey-editor.tsx). Two entry points, one write path
  (saveSurveyCore):

  - saveCompanyEventSurvey: the provider, on its own event's Survey tab. Not
    audited, like every other company-side edit.
  - saveAdminEventSurvey: an admin, from /admin/companies/[id]/events/[eventId]/survey.
    Writes an EVENT_SURVEY_UPDATED audit row in the SAME transaction as the
    change, and only when the survey actually changed.

  Both refuse unless the company has surveys turned on and the event has been
  submitted (a DRAFT is still in the wizard). The survey sits outside
  accreditation content, so APPROVED and REJECTED events stay editable.

  Shaped for useActionState: validation problems come back as field errors
  keyed "<index>.<field>" so the editor can place each one on its control.
*/

// Generous transport cap: 40 questions x (500-char prompt + 20 x 200-char
// options) is about 180k characters before JSON overhead.
const QUESTIONS_JSON_MAX = 500_000;

const saveSurveyFormSchema = z.object({
  // z.guid, matching survey-schemas: tolerate any well-formed 8-4-4-4-12 id.
  eventId: z.guid(),
  questions: z.string().max(QUESTIONS_JSON_MAX),
});

const UNREADABLE = "The survey could not be read. Reload the page and try again.";
const UNAVAILABLE = "This survey can no longer be edited. Reload the page to see why.";

function formError(message: string): SurveySaveState {
  return { ok: false, errors: { [SURVEY_FORM_KEY]: [message] } };
}

function parseForm(formData: FormData) {
  const parsed = saveSurveyFormSchema.safeParse({
    eventId: formData.get("eventId"),
    questions: formData.get("questions"),
  });
  return parsed.success ? parsed.data : null;
}

/** Display name for an event in audit rows: it has no title column. */
function eventLabel(e: { name: string; eventIdNumber: string | null }): string {
  return e.name.trim() || e.eventIdNumber || "Untitled event";
}

export async function saveCompanyEventSurvey(
  _prev: SurveySaveState,
  formData: FormData,
): Promise<SurveySaveState> {
  const user = await requireDentalAce();
  const form = parseForm(formData);
  if (!form) return formError(UNREADABLE);
  const companyId = user.companyId;
  if (!companyId) return formError(UNAVAILABLE);

  const result = await prisma.$transaction(async (tx) => {
    // Ownership is part of the lookup: another company's event reads as missing.
    const event = await tx.event.findFirst({
      where: { id: form.eventId, companyId },
      select: { status: true, company: { select: { surveyEnabled: true } } },
    });
    if (!event || event.status === "DRAFT" || !event.company.surveyEnabled) return null;
    return saveSurveyCore(tx, form.eventId, form.questions);
  });

  if (!result) return formError(UNAVAILABLE);
  if (!result.ok) return { ok: false, errors: result.errors };

  revalidatePath(`/company/events/${form.eventId}`);
  return { ok: true, savedAt: Date.now(), questions: result.questions };
}

export async function saveAdminEventSurvey(
  _prev: SurveySaveState,
  formData: FormData,
): Promise<SurveySaveState> {
  const admin = await requireStaff("ADMIN");
  const form = parseForm(formData);
  if (!form) return formError(UNREADABLE);

  const result = await prisma.$transaction(async (tx) => {
    const event = await tx.event.findUnique({
      where: { id: form.eventId },
      select: {
        name: true,
        eventIdNumber: true,
        status: true,
        companyId: true,
        company: { select: { name: true, surveyEnabled: true } },
      },
    });
    if (!event || event.status === "DRAFT" || !event.company.surveyEnabled) return null;

    const saved = await saveSurveyCore(tx, form.eventId, form.questions);
    if (saved.ok && saved.changed) {
      const eventName = eventLabel(event);
      const n = saved.questions.length;
      await recordAdminAction(tx, {
        actorUserId: admin.id,
        action: AdminAuditAction.EVENT_SURVEY_UPDATED,
        summary: `Updated the survey for event "${eventName}" (${n} question${n === 1 ? "" : "s"})`,
        details: {
          companyId: event.companyId,
          // companyName is the shared key the audit log links a company by.
          companyName: event.company.name,
          eventId: form.eventId,
          eventName,
          questionCount: n,
        },
      });
    }
    return { saved, companyId: event.companyId };
  });

  if (!result) return formError(UNAVAILABLE);
  const { saved, companyId } = result;
  if (!saved.ok) return { ok: false, errors: saved.errors };

  revalidatePath(`/admin/companies/${companyId}`);
  revalidatePath(`/admin/companies/${companyId}/events/${form.eventId}/survey`);
  return { ok: true, savedAt: Date.now(), questions: saved.questions };
}
