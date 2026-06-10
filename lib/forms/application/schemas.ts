import { z } from "zod";

/*
  Zod schemas for the 32-field course application, split into the 5 form
  steps. The merged ApplicationData shape lives below; each step's schema
  validates that step's slice. Persisted in
  course_applications.application_data as JSON.

  Quiz: Q1 + Q2 are True/False; Q3, Q4, Q5 are 4-option multiple choice
  with exactly one option marked correct.
*/

export const DELIVERY_FORMATS = [
  "Live/In Person",
  "Live/Virtual",
  "Written Education",
  "On Demand",
] as const;

/*
  Formats that count as a live event for the combined-certificate questions
  and Event Setup eligibility. "Live Event" is the legacy value from
  applications saved before the 2026-06 format rename; existing data is never
  migrated, so the predicate must keep accepting it.
*/
export const LIVE_FORMATS = ["Live/In Person", "Live/Virtual"] as const;

export function isLiveFormat(format: string | undefined | null): boolean {
  if (!format) return false;
  return (
    (LIVE_FORMATS as readonly string[]).includes(format) ||
    format === "Live Event"
  );
}

// Stored under the legacy `subjectMatter` JSON key (renaming the key would
// orphan every existing draft and application).
export const CATEGORIES = [
  "Business/Practice Management",
  "Scientific",
] as const;

export const TARGET_AUDIENCES = [
  "General Dentists",
  "Dental Hygienists",
  "Dental Assistants",
  "All Dental Professionals",
  "Periodontists",
  "Pediatric Dentists",
] as const;

export const fileRef = z.object({
  storagePath: z.string(),
  filename: z.string(),
  uploadedAt: z.string(),
});
export type FileRef = z.infer<typeof fileRef>;

export const step1Schema = z.object({
  courseTitle: z.string().min(3, "Course title is required").max(200),
  ceCreditHours: z.number().min(0.5).max(40),
  subjectMatter: z.enum(CATEGORIES),
  deliveryFormat: z.enum(DELIVERY_FORMATS),
  combinedCert: z.boolean().optional(),
  submitSessionsSeparately: z.boolean().optional(),
  publicProtectionStatement: z.string().min(20, "Please describe how this course benefits patient safety").max(2000),
  courseObjectives: z.string().min(20, "List at least 3 objectives").max(2000),
  targetAudience: z.enum(TARGET_AUDIENCES),
  courseOutline: fileRef.optional(),
});

export const step2Schema = z.object({
  creatorName: z.string().min(2).max(200),
  credentials: z.string().min(2).max(200),
  currentPosition: z.string().min(2).max(200),
  professionalBio: z.string().min(20).max(2000),
  cvResume: fileRef.optional(),
});

export const presenterSchema = z.object({
  name: z.string().min(2).max(200),
  role: z.enum(["Primary Presenter", "Co-Presenter", "Moderator"]),
  commercialDisclosure: z.string().min(2).max(1000),
});

export const step3Schema = z.object({
  presenters: z.array(presenterSchema).min(1).max(8),
  // Phase 1 ships a single primary presenter, so the headshot is captured once
  // at the top level (uploaded straight to applicationData) rather than nested
  // per-presenter. It survives mergeStep because saveStep3 never sets this key.
  headshot: fileRef.optional(),
});

const trueFalseQuestionSchema = z.object({
  type: z.literal("TF"),
  question: z.string().min(5).max(500),
  correctAnswer: z.enum(["True", "False"]),
});

const multipleChoiceQuestionSchema = z.object({
  type: z.literal("MC"),
  question: z.string().min(5).max(500),
  options: z.array(z.string().min(1).max(200)).length(4),
  correctIndex: z.number().int().min(0).max(3),
});

export const quizQuestionSchema = z.discriminatedUnion("type", [
  trueFalseQuestionSchema,
  multipleChoiceQuestionSchema,
]);

export const step4Schema = z.object({
  quiz: z
    .array(quizQuestionSchema)
    .length(5)
    .refine((quiz) => quiz[0]?.type === "TF" && quiz[1]?.type === "TF", {
      message: "Q1 and Q2 must be True/False",
    })
    .refine((quiz) => quiz.slice(2).every((q) => q.type === "MC"), {
      message: "Q3, Q4, and Q5 must be Multiple Choice",
    }),
});

export const applicationDataSchema = step1Schema
  .merge(step2Schema)
  .merge(step3Schema)
  .merge(step4Schema);

/*
  Tolerant variant for READING persisted application_data. Applications saved
  before the 2026-06 form changes carry retired enum values ("Live Event",
  "Periodontics", ...) plus removed fields (courseDurationHours,
  adaCerpCategory). The strict schema would make those records unviewable and
  unapprovable, so readers (reviewer detail/approve, Event Setup eligibility)
  parse with this one. The strict schema stays on the WRITE path (saveStep1,
  submit) so new data always uses the current options.
*/
export const applicationDataReadSchema = applicationDataSchema
  .extend({
    subjectMatter: z.string(),
    deliveryFormat: z.string(),
    targetAudience: z.string(),
    courseDurationHours: z.number().optional(),
    adaCerpCategory: z.string().optional(),
  })
  .passthrough();

export type ApplicationDataRead = z.infer<typeof applicationDataReadSchema>;

export type ApplicationData = z.infer<typeof applicationDataSchema>;
export type Step1Data = z.infer<typeof step1Schema>;
export type Step2Data = z.infer<typeof step2Schema>;
export type Step3Data = z.infer<typeof step3Schema>;
export type Step4Data = z.infer<typeof step4Schema>;
export type PresenterData = z.infer<typeof presenterSchema>;
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;
