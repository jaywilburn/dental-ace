import { z } from "zod";
import { attendeeAnswerSchema, isRecentCompletionDate } from "@/lib/attend/schemas";
import { COURSE_FORMATS } from "@/lib/forms/application/schemas";
import { ATTENDANCE_CODE_MAX } from "@/lib/attend/attendance-code";
import { SURVEY_VERSION_MAX, surveyAnswerInputSchema } from "@/lib/events/survey-schemas";

/*
  Event attendee submission boundary. Like attendeeSubmissionSchema but the quiz
  is variable length (1 question per attended session/course) and selective types
  carry the chosen session ids. The server re-derives the questions from those
  ids and scores in order; the client never supplies questions.
*/

/*
  Event answers add the attendance code (SELECTIVE_INLINE CODE questions) to the
  shared TF/MC answers. The single-course attendeeAnswerSchema stays TF/MC, so
  /attend/[token] keeps rejecting a CODE answer. The typed code is kept as
  entered (trimmed); matching normalises it (lib/attend/attendance-code.ts).
*/
export const eventAttendeeAnswerSchema = z.discriminatedUnion("type", [
  ...attendeeAnswerSchema.options,
  z.object({
    type: z.literal("CODE"),
    answer: z.string().trim().max(ATTENDANCE_CODE_MAX, "Attendance code is too long"),
  }),
]);
export type EventAttendeeAnswer = z.infer<typeof eventAttendeeAnswerSchema>;
export const eventAttendeeSubmissionSchema = z.object({
  token: z.guid(),
  attendeeName: z.string().trim().min(2, "Please enter your full name").max(200, "Name is too long"),
  attendeeEmail: z.string().trim().email("Enter a valid email address").max(200, "Email is too long"),
  licenseNumber: z.string().trim().max(100, "License number is too long").optional(),
  licenseType: z.string().trim().max(100, "License type is too long").optional(),
  licenseStates: z
    .array(z.string().length(2, "Use two letter state codes"))
    .min(1, "Select your state of licensure")
    .max(10, "Too many states selected"),
  // How the attendee took the event. Pre-filled to the event's live format and
  // editable to any of the four canonical options; becomes the certificate's
  // deliveryMethod. Optional for version-skew resilience: a stale client bundle
  // from before a deploy may omit it; the action falls back to LIVE In Person.
  courseFormat: z.enum(COURSE_FORMATS, "Choose how you attended the event").optional(),
  completionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date you completed the event")
    .refine(isRecentCompletionDate, {
      message: "Enter a date within the last 10 years that is not in the future",
    }),
  // EventSession ids the attendee attended (selective types). Empty for full
  // attendance (the server uses every session/the event quiz).
  selectedSessionIds: z.array(z.string().uuid()).max(30),
  affirmed: z.literal(true, "Please confirm that you attended the event"),
  answers: z.array(eventAttendeeAnswerSchema).min(1, "Please answer the quiz questions").max(30, "Too many answers"),
  // Host survey answers (question id -> answer). Transport bounds only; the
  // action checks them against the event's CURRENT survey (and ignores them
  // when the event has no active survey).
  survey: surveyAnswerInputSchema.optional(),
  // surveyVersion() of the survey the page rendered. The action asks for a
  // reload when it differs from the current survey's version.
  surveyVersion: z.string().max(SURVEY_VERSION_MAX).optional(),
});

export type EventAttendeeSubmission = z.infer<typeof eventAttendeeSubmissionSchema>;

/*
  The No-CE path of a survey-first event link: an attendee who does not need
  CE credit identifies themselves and submits the survey only (no license, no
  quiz, no certificate). Name and email follow the certificate submission's
  rules exactly; the survey fields are the same transport bounds, checked
  against the event's CURRENT survey by submitEventSurveyOnly.
*/
export const eventSurveyOnlySubmissionSchema = eventAttendeeSubmissionSchema
  .pick({ token: true, attendeeName: true, attendeeEmail: true })
  .extend({
    survey: surveyAnswerInputSchema.optional(),
    surveyVersion: z.string().max(SURVEY_VERSION_MAX).optional(),
  });

export type EventSurveyOnlySubmission = z.infer<typeof eventSurveyOnlySubmissionSchema>;
