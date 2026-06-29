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
  "Live/Online",
  "On Demand Video",
  "On Demand Audio",
  "Printed Course",
] as const;

/*
  Formats that count as a live event for the combined-certificate questions
  and Event Setup eligibility. "Live/Virtual" and "Live Event" are retired
  values from applications saved before the 2026-06 format changes; existing
  data is never migrated, so the predicate must keep accepting them.
*/
export const LIVE_FORMATS = ["Live/In Person", "Live/Online"] as const;

export function isLiveFormat(format: string | undefined | null): boolean {
  if (!format) return false;
  return (
    (LIVE_FORMATS as readonly string[]).includes(format) ||
    format === "Live Event" ||
    format === "Live/Virtual"
  );
}

// Stored under the legacy `subjectMatter` JSON key (renaming the key would
// orphan every existing draft and application).
export const CATEGORIES = [
  "Business/Practice Management",
  "Scientific",
] as const;

export const HIGHEST_DEGREES = [
  "Associates",
  "Bachelors",
  "Masters",
  "Doctoral",
  "None of the Above",
] as const;

export const fileRef = z.object({
  storagePath: z.string(),
  filename: z.string(),
  uploadedAt: z.string(),
});
export type FileRef = z.infer<typeof fileRef>;

export const orgStepSchema = z.object({
  organizationName: z.string().min(2, "Organization name is required").max(200),
  organizationAddress: z
    .string()
    .min(5, "Full address (City, State, Zip) is required")
    .max(400),
  adminName: z.string().min(2, "Process administrator name is required").max(200),
  adminEmail: z.string().email("Enter a valid email"),
  adminPhone: z.string().min(7, "Enter a valid phone number").max(40),
});

export const step1Schema = z.object({
  courseTitle: z.string().min(3, "Course title is required").max(200),
  ceCreditHours: z.number().min(0.5).max(40),
  subjectMatter: z.enum(CATEGORIES),
  deliveryFormat: z.enum(DELIVERY_FORMATS),
  primaryDistributionFormat: z.enum(DELIVERY_FORMATS),
  shortDescription: z
    .string()
    .min(20, "Add a short description (up to 2 paragraphs)")
    .max(1500),
  publicProtectionStatement: z.string().min(20, "Please describe how this course benefits patient safety").max(2000),
  courseObjectives: z.string().min(20, "List at least 3 objectives").max(2000),
  // Text since 2026-06 (client feedback: type/paste the outline, not upload).
  // Applications saved before the change carry a fileRef under this key; the
  // read schema below keeps those parseable.
  courseOutline: z
    .string()
    .min(1, "Course outline is required")
    .max(20_000),
});

export const step2Schema = z.object({
  creatorName: z.string().min(2).max(200),
  credentials: z.string().min(2).max(200),
  currentPosition: z.string().min(2).max(200),
  // Rich-text bio authored in the Step 2 editor (client feedback 2026-06:
  // WYSIWYG, not an upload). Always sanitized through
  // lib/forms/application/rich-text.ts before it reaches this schema;
  // saveStep2 additionally enforces a minimum visible-text length.
  detailedBioHtml: z.string().min(1, "Detailed bio is required").max(20_000),
  creatorEmail: z.string().email("Enter a valid email"),
  creatorPhone: z.string().min(7, "Enter a valid phone number").max(40),
  creatorAddress: z.string().min(5, "Address (City, State, Zip) is required").max(400),
  highestDegree: z.enum(HIGHEST_DEGREES),
  educationPart1: z
    .string()
    .min(2, "List universities/colleges, degrees, and graduation dates")
    .max(1000),
  educationPart2: z.string().max(1000).optional(),
  educationPart3: z.string().max(1000).optional(),
  educationPart4: z.string().max(1000).default("N/A"),
  creatorExperience: z
    .string()
    .min(10, "Describe experience relative to the course subject")
    .max(2000),
  // CV/Resume question removed 2026-06 (client: no longer needed). Legacy
  // applications still carry a cvResume value; the read schema keeps it
  // parseable so old records stay viewable.
});

export const presenterSchema = z.object({
  name: z.string().min(2).max(200),
  role: z.enum(["Primary Presenter", "Co-Presenter", "Moderator"]),
  commercialDisclosure: z.string().min(2).max(1000),
  experience: z.string().min(2, "Experience is required").max(1000),
  training: z.string().min(2, "Training received is required").max(1000),
  bio: z.string().min(2, "Bio is required").max(2000),
});

export const step3Schema = z.object({
  presenters: z.array(presenterSchema).min(1).max(8),
  // Presenter headshot upload removed 2026-06 (client: no longer needed).
  // Legacy applications still carry a headshot fileRef; the read schema keeps
  // it parseable so old records stay viewable (shown via the Attachments card).
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

export const applicationDataSchema = orgStepSchema
  .merge(step1Schema)
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
    // Removed from the form 2026-06; applications saved before then still
    // carry a value, which stays inert in the JSON.
    targetAudience: z.string().optional(),
    courseDurationHours: z.number().optional(),
    adaCerpCategory: z.string().optional(),
    // Bio lineage: plain-text professionalBio (pre-2026-06), uploaded
    // detailedBio file (briefly, June 2026), now rich-text detailedBioHtml.
    // Readers display whichever the application carries.
    professionalBio: z.string().optional(),
    detailedBio: fileRef.optional(),
    detailedBioHtml: z.string().optional(),
    // Outline + CV lineage: uploaded files until 2026-06, text since. Readers
    // accept either form (string = current text, fileRef = legacy upload
    // shown via resolveAttachmentLinks) or absence.
    courseOutline: z.union([z.string(), fileRef]).optional(),
    cvResume: z.union([z.string(), fileRef]).optional(),
    // Removed from the form 2026-06; legacy applications still carry it.
    headshot: fileRef.optional(),
    // New 2026-06 fields — optional on read so applications created before this
    // change remain viewable/approvable in the reviewer detail view.
    organizationName: z.string().optional(),
    organizationAddress: z.string().optional(),
    adminName: z.string().optional(),
    adminEmail: z.string().optional(),
    adminPhone: z.string().optional(),
    shortDescription: z.string().optional(),
    primaryDistributionFormat: z.string().optional(),
    creatorEmail: z.string().optional(),
    creatorPhone: z.string().optional(),
    creatorAddress: z.string().optional(),
    highestDegree: z.string().optional(),
    educationPart1: z.string().optional(),
    educationPart2: z.string().optional(),
    educationPart3: z.string().optional(),
    educationPart4: z.string().optional(),
    creatorExperience: z.string().optional(),
    // Legacy presenter arrays lack experience/training/bio; keep them readable.
    presenters: z
      .array(
        z.object({
          name: z.string(),
          role: z.string(),
          commercialDisclosure: z.string().optional(),
          experience: z.string().optional(),
          training: z.string().optional(),
          bio: z.string().optional(),
        }),
      )
      .optional(),
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
