import { z } from "zod";
import { attendeeAnswerSchema, isRecentCompletionDate } from "@/lib/attend/schemas";
import { COURSE_FORMATS } from "@/lib/forms/application/schemas";

/*
  Event attendee submission boundary. Like attendeeSubmissionSchema but the quiz
  is variable length (1 question per attended session/course) and selective types
  carry the chosen session ids. The server re-derives the questions from those
  ids and scores in order; the client never supplies questions.
*/
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
  answers: z.array(attendeeAnswerSchema).min(1, "Please answer the quiz questions").max(30, "Too many answers"),
});

export type EventAttendeeSubmission = z.infer<typeof eventAttendeeSubmissionSchema>;
