import { z } from "zod";
import {
  CATEGORIES,
  COURSE_FORMATS,
  step1Schema,
  step4Schema,
  type QuizQuestion,
} from "@/lib/forms/application/schemas";
import { quizFromFormData } from "@/lib/forms/application/quiz-form";
import { normalizeFormText } from "@/lib/forms/normalize";
import { fieldErrorsFromZod, type FieldErrors } from "@/lib/forms/field-errors";

/*
  Pure validation for the admin "Add approved course" form
  (lib/admin/course-add.ts) and the per-course "Edit details" form
  (lib/admin/course-details.ts). No DB, no server-only, so it is unit-tested
  directly and the client form can import the field names and date helpers.

  Admin-added courses were approved somewhere other than this site's review
  queue (first use: DA236, accredited before DentalACE One and never in the
  legacy export), so the admin supplies what the reviewer flow would normally
  generate: the course ID and the approval date. Title, hours, subject, format
  and quiz reuse the application wizard's own rules, so an admin can never
  create a course the wizard would have rejected.

  Course ID is free text so this works for any client's numbering, with one
  carve-out: the ACE-YYYY- prefix belongs to the site's own approvals.
  nextCourseIdNumber (lib/reviewer/accredit.ts) takes the string-max ID under
  that prefix and adds one, so a hand-typed "ACE-2026-9" or "ACE-2026-ABC" would
  make the next reviewer approval compute a duplicate and fail on the unique
  index.
*/

export const COURSE_ID_MAX = 40;
export const LEGACY_COURSE_ID_MAX = 40;

/** Reserved for ACE-YYYY-##### IDs minted by reviewer approval. */
const RESERVED_COURSE_ID = /^ACE-\d{4}-/i;
// Letters, digits and the separators real course IDs use (ACE-LEG-00124,
// DA236, PPL/2026.04, #12). No quotes or angle brackets: the ID prints on
// certificates and letters.
const COURSE_ID_CHARS = /^[A-Za-z0-9][A-Za-z0-9 ._/#-]*$/;

/** Accreditation lasts 3 years from the approval date, like every course. */
export const ACCREDITATION_YEARS = 3;

/*
  "Today" for the approval date, in US Central time. The server runs in UTC, so
  a UTC date would already be tomorrow for an admin working in the US evening.
*/
export const APP_TIME_ZONE = "America/Chicago";

export function todayIso(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** A YYYY-MM-DD date stored at noon UTC, so it reads as the same calendar day
 *  in every US time zone (same convention as the legacy imports). */
export function dateFromIso(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

export function isoFromDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function expiryIsoFor(approvedIso: string): string {
  const d = dateFromIso(approvedIso);
  d.setUTCFullYear(d.getUTCFullYear() + ACCREDITATION_YEARS);
  return isoFromDate(d);
}

function isCalendarDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = dateFromIso(iso);
  return !Number.isNaN(d.getTime()) && isoFromDate(d) === iso;
}

export const courseIdNumberSchema = z
  .string()
  .min(2, "Enter the course ID.")
  .max(COURSE_ID_MAX, `Keep the course ID under ${COURSE_ID_MAX} characters.`)
  .regex(
    COURSE_ID_CHARS,
    "Use letters, numbers, spaces and - _ . / # only, starting with a letter or number.",
  )
  .refine((v) => !RESERVED_COURSE_ID.test(v), {
    message:
      "IDs starting with ACE- and a year (e.g. ACE-2026-) are reserved for courses approved through the review queue. Use another ID, such as ACE-LEG-00124.",
  });

// CE hours come from a text input, so coerce. Empty becomes NaN, which the
// wizard's own min/max rule reports as out of range; say "required" instead.
const ceHoursSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : undefined),
  z
    .number({ error: "Enter the CE hours." })
    .pipe(step1Schema.shape.ceCreditHours)
    // course_applications.ce_hours is DECIMAL(5,2).
    .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, {
      message: "Use at most two decimal places (e.g. 4.75).",
    }),
);

/** The fields "Edit details" can change; the add form collects them too. */
export function courseDetailsSchema(today: string) {
  return z.object({
    ceHours: ceHoursSchema,
    courseType: z.enum(CATEGORIES, { error: "Choose a subject." }),
    deliveryMethod: z.enum(COURSE_FORMATS, { error: "Choose a format." }),
    approvedOn: z
      .string()
      .refine(isCalendarDate, { message: "Enter the approval date." })
      .refine((iso) => !isCalendarDate(iso) || iso <= today, {
        message: "The approval date can't be in the future.",
      })
      .refine((iso) => !isCalendarDate(iso) || expiryIsoFor(iso) > today, {
        message: `A course approved on this date has already expired (accreditation lasts ${ACCREDITATION_YEARS} years).`,
      }),
  });
}

export type CourseDetails = z.infer<ReturnType<typeof courseDetailsSchema>>;

/** Raw form values, echoed back so a rejected submit keeps what was typed. */
export type AddCourseValues = {
  courseIdNumber: string;
  courseTitle: string;
  legacyCourseId: string;
  ceHours: string;
  courseType: string;
  deliveryMethod: string;
  approvedOn: string;
  quiz: QuizQuestion[];
};

export type AddCourseInput = Omit<CourseDetails, "approvedOn"> & {
  courseIdNumber: string;
  courseTitle: string;
  legacyCourseId: string | null;
  approvedOn: string;
  expiresOn: string;
  quiz: QuizQuestion[];
};

/*
  useActionState shape for the add form. Success redirects, so only a rejected
  submit comes back. `attempt` changes on every rejection so the form can
  remount with the echoed values: React 19 resets uncontrolled inputs after an
  action, which would otherwise wipe five quiz questions on one typo.
*/
export type AddCourseState = {
  errors: FieldErrors;
  values: AddCourseValues | null;
  attempt: number;
} | null;

export type AddCourseParse =
  | { ok: true; data: AddCourseInput }
  | { ok: false; errors: FieldErrors; values: AddCourseValues };

type FormLike = Pick<FormData, "get">;

/** Trim and collapse runs of whitespace, so "DA  236 " and "DA 236" match. */
function oneLine(v: FormDataEntryValue | null): string {
  return normalizeFormText(v).replace(/\s+/g, " ").trim();
}

export function addCourseValuesFrom(formData: FormLike): AddCourseValues {
  return {
    courseIdNumber: oneLine(formData.get("courseIdNumber")),
    courseTitle: oneLine(formData.get("courseTitle")),
    legacyCourseId: oneLine(formData.get("legacyCourseId")),
    ceHours: oneLine(formData.get("ceHours")),
    courseType: oneLine(formData.get("courseType")),
    deliveryMethod: oneLine(formData.get("deliveryMethod")),
    approvedOn: oneLine(formData.get("approvedOn")),
    quiz: quizFromFormData(formData),
  };
}

export function parseAddCourseForm(formData: FormLike, today: string): AddCourseParse {
  const values = addCourseValuesFrom(formData);
  const errors: FieldErrors = {};
  const add = (key: string, message: string) => {
    const bucket = (errors[key] ??= []);
    if (!bucket.includes(message)) bucket.push(message);
  };

  const id = courseIdNumberSchema.safeParse(values.courseIdNumber);
  if (!id.success) add("courseIdNumber", id.error.issues[0]?.message ?? "Enter a valid course ID.");

  const title = step1Schema.shape.courseTitle.safeParse(values.courseTitle);
  if (!title.success) add("courseTitle", title.error.issues[0]?.message ?? "Enter the course title.");

  if (values.legacyCourseId.length > LEGACY_COURSE_ID_MAX) {
    add("legacyCourseId", `Keep the legacy course number under ${LEGACY_COURSE_ID_MAX} characters.`);
  }

  const details = courseDetailsSchema(today).safeParse(values);
  if (!details.success) {
    for (const [key, messages] of Object.entries(fieldErrorsFromZod(details.error))) {
      for (const m of messages) add(key, m);
    }
  }

  const quiz = step4Schema.safeParse({ quiz: values.quiz });
  if (!quiz.success) {
    for (const [key, messages] of Object.entries(fieldErrorsFromZod(quiz.error))) {
      for (const m of messages) add(key, m);
    }
  }

  if (!id.success || !title.success || !details.success || !quiz.success || errors.legacyCourseId) {
    return { ok: false, errors, values };
  }
  return {
    ok: true,
    data: {
      courseIdNumber: id.data,
      courseTitle: title.data,
      legacyCourseId: values.legacyCourseId || null,
      ...details.data,
      expiresOn: expiryIsoFor(details.data.approvedOn),
      quiz: quiz.data.quiz,
    },
  };
}

export type DetailsParse =
  | { ok: true; data: CourseDetails & { expiresOn: string } }
  | { ok: false; error: string };

/*
  "Edit details" posts a small inline form and redirects with ?error=, like
  rename and retire, so it reports the first problem as one message. The
  past-expiry rule only applies when the approval date actually changes: fixing
  the hours on a course that has since expired must still work.
*/
export function parseCourseDetailsForm(
  formData: FormLike,
  today: string,
  currentApprovedOn: string,
): DetailsParse {
  const raw = {
    ceHours: oneLine(formData.get("ceHours")),
    courseType: oneLine(formData.get("courseType")),
    deliveryMethod: oneLine(formData.get("deliveryMethod")),
    approvedOn: oneLine(formData.get("approvedOn")),
  };
  const schema =
    raw.approvedOn === currentApprovedOn
      ? courseDetailsSchema(today).extend({ approvedOn: z.literal(currentApprovedOn) })
      : courseDetailsSchema(today);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the course details." };
  }
  return {
    ok: true,
    data: { ...parsed.data, expiresOn: expiryIsoFor(parsed.data.approvedOn) },
  };
}

/*
  Drafts (admin_course_drafts.values). Saving a draft validates nothing beyond
  size: an admin saves one precisely because details are missing. Every field
  is clamped to its input's maxLength, so only a tampered post loses anything,
  and the quiz keeps the fixed TF/TF/MC/MC/MC shape QuizFields renders. Reading
  one back is tolerant: anything malformed comes back blank rather than
  breaking the form.
*/
const DRAFT_MAX = {
  courseIdNumber: COURSE_ID_MAX,
  courseTitle: 200,
  legacyCourseId: LEGACY_COURSE_ID_MAX,
  ceHours: 10,
  courseType: 60,
  deliveryMethod: 60,
  approvedOn: 10,
  question: 500,
  option: 200,
} as const;

const clamp = (v: string, max: number) => v.slice(0, max);

function clampIndex(n: unknown): number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 3 ? n : 0;
}

function clampQuiz(quiz: QuizQuestion[]): QuizQuestion[] {
  return quiz.map((q) =>
    q.type === "TF"
      ? { type: "TF", question: clamp(q.question, DRAFT_MAX.question), correctAnswer: q.correctAnswer }
      : {
          type: "MC",
          question: clamp(q.question, DRAFT_MAX.question),
          options: q.options.map((o) => clamp(o, DRAFT_MAX.option)),
          correctIndex: clampIndex(q.correctIndex),
        },
  );
}

export function draftValuesFrom(formData: FormLike): AddCourseValues {
  const v = addCourseValuesFrom(formData);
  return {
    courseIdNumber: clamp(v.courseIdNumber, DRAFT_MAX.courseIdNumber),
    courseTitle: clamp(v.courseTitle, DRAFT_MAX.courseTitle),
    legacyCourseId: clamp(v.legacyCourseId, DRAFT_MAX.legacyCourseId),
    ceHours: clamp(v.ceHours, DRAFT_MAX.ceHours),
    courseType: clamp(v.courseType, DRAFT_MAX.courseType),
    deliveryMethod: clamp(v.deliveryMethod, DRAFT_MAX.deliveryMethod),
    approvedOn: clamp(v.approvedOn, DRAFT_MAX.approvedOn),
    quiz: clampQuiz(v.quiz),
  };
}

const text = z.string().catch("");
const storedDraftSchema = z.object({
  courseIdNumber: text,
  courseTitle: text,
  legacyCourseId: text,
  ceHours: text,
  courseType: text,
  deliveryMethod: text,
  approvedOn: text,
  quiz: z
    .array(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("TF"), question: text, correctAnswer: z.enum(["True", "False"]).catch("True") }),
        z.object({
          type: z.literal("MC"),
          question: text,
          options: z.array(text).length(4).catch(["", "", "", ""]),
          correctIndex: z.number().int().min(0).max(3).catch(0),
        }),
      ]),
    )
    .catch([]),
});

const EMPTY_VALUES: AddCourseValues = {
  courseIdNumber: "",
  courseTitle: "",
  legacyCourseId: "",
  ceHours: "",
  courseType: "",
  deliveryMethod: "",
  approvedOn: "",
  quiz: [],
};

export function parseDraftValues(stored: unknown): AddCourseValues {
  const parsed = storedDraftSchema.safeParse(stored);
  return parsed.success ? (parsed.data as AddCourseValues) : EMPTY_VALUES;
}

/** How a draft is named in lists before it has a title. */
export function draftLabel(values: Pick<AddCourseValues, "courseTitle" | "courseIdNumber">): string {
  return values.courseTitle || values.courseIdNumber || "Untitled draft";
}
