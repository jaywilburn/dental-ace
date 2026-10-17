"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { eventSurveyOnlySubmissionSchema } from "@/lib/attend/event-schemas";
import { flattenFieldErrors } from "@/lib/attend/schemas";
import { loadEventByToken, activeSurvey } from "@/lib/attend/event-quiz";
import { eventAttendRateLimit } from "@/lib/attend/event-rate-limit";
import {
  SURVEY_FORM_KEY,
  SURVEY_STALE_MESSAGE,
  surveyErrorKey,
  surveyVersion,
  validateSurveyResponses,
} from "@/lib/events/survey-schemas";

/*
  The No-CE path of a survey-first event link (/attend/event/[token]): an
  attendee who answered "No" to "Do you need CE credit for this event?" submits
  the host survey with just their name and email. One event_survey_responses
  row; never a certificate, never a cert credit, never an attempt, so the
  lockout counts in submitEventAttendance are untouched.

  Gates mirror the certificate submit: the same shared rate-limit bucket, the
  same approved + unexpired event check (no cert-balance check: nothing is
  issued), then the survey must still be active and match the version the page
  rendered (a survey switched off or edited while the page was open asks for a
  reload), then validateSurveyResponses. A submission with every optional
  question skipped is still recorded (responses = []): the attendee identified
  themselves, and the export lists them with blank answers.

  Repeat submissions from one email are allowed; the export reports the latest.
*/

export type EventSurveyOnlyResult =
  | { status: "recorded" }
  | { status: "rate_limited"; retryAfterMs: number }
  | { status: "event_inactive" }
  | { status: "invalid"; fieldErrors: Record<string, string[]> };

export async function submitEventSurveyOnly(input: unknown): Promise<EventSurveyOnlyResult> {
  const parsed = eventSurveyOnlySubmissionSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = flattenFieldErrors(parsed.error);
    // Field names + static schema messages only, never submitted values.
    console.error("[submitEventSurveyOnly] invalid submission", JSON.stringify(fieldErrors));
    return { status: "invalid", fieldErrors };
  }
  const sub = parsed.data;

  const limit = await eventAttendRateLimit(sub.token);
  if (!limit.ok) return { status: "rate_limited", retryAfterMs: limit.retryAfterMs };

  const event = await loadEventByToken(sub.token);
  if (!event || event.status !== "APPROVED" || event.expiresAt === null || event.expiresAt < new Date()) {
    return { status: "event_inactive" };
  }

  const survey = activeSurvey(event);
  if (!survey || sub.surveyVersion !== surveyVersion(survey)) {
    return { status: "invalid", fieldErrors: { [SURVEY_FORM_KEY]: [SURVEY_STALE_MESSAGE] } };
  }
  const checked = validateSurveyResponses(survey, sub.survey);
  if (!checked.ok) {
    const fieldErrors: Record<string, string[]> = {};
    for (const [key, msgs] of Object.entries(checked.errors)) {
      fieldErrors[key === SURVEY_FORM_KEY ? SURVEY_FORM_KEY : surveyErrorKey(key)] = msgs;
    }
    return { status: "invalid", fieldErrors };
  }

  await prisma.eventSurveyResponse.create({
    data: {
      eventId: event.id,
      attendeeName: sub.attendeeName,
      // Lowercased like issued_certificates.attendee_email, so the export and
      // counts merge both sources on one key.
      attendeeEmail: sub.attendeeEmail.toLowerCase(),
      responses: checked.responses as Prisma.InputJsonValue,
    },
  });
  return { status: "recorded" };
}
