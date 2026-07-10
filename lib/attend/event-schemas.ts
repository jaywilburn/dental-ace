import { z } from "zod";
import { attendeeAnswerSchema } from "@/lib/attend/schemas";
import { COURSE_FORMATS } from "@/lib/forms/application/schemas";

/*
  Event attendee submission boundary. Like attendeeSubmissionSchema but the quiz
  is variable length (1 question per attended session/course) and selective types
  carry the chosen session ids. The server re-derives the questions from those
  ids and scores in order; the client never supplies questions.
*/
export const eventAttendeeSubmissionSchema = z.object({
  token: z.guid(),
  attendeeName: z.string().min(2).max(200),
  attendeeEmail: z.string().email().max(200),
  licenseNumber: z.string().max(100).optional(),
  licenseType: z.string().max(100).optional(),
  licenseStates: z.array(z.string().length(2)).min(1).max(10),
  // How the attendee took the event. Pre-filled to the event's live format and
  // editable to any of the four canonical options; becomes the certificate's
  // deliveryMethod.
  courseFormat: z.enum(COURSE_FORMATS),
  completionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date you completed the event")
    .refine(
      (s) => {
        const d = new Date(`${s}T12:00:00`);
        if (Number.isNaN(d.getTime())) return false;
        const now = new Date();
        const earliest = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate());
        return d <= now && d >= earliest;
      },
      { message: "Date must be within the last 10 years and not in the future" },
    ),
  // EventSession ids the attendee attended (selective types). Empty for full
  // attendance (the server uses every session/the event quiz).
  selectedSessionIds: z.array(z.string().uuid()).max(30),
  affirmed: z.literal(true),
  answers: z.array(attendeeAnswerSchema).min(1).max(30),
});

export type EventAttendeeSubmission = z.infer<typeof eventAttendeeSubmissionSchema>;
