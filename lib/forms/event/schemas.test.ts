import { describe, it, expect } from "vitest";
import { EventType } from "@prisma/client";
import {
  deriveEventType,
  isEventOnly,
  eventCreditCost,
  isSelective,
  isPerCourse,
  isInlineFullCourse,
  inlineSessionSchema,
  isInlineSessionComplete,
  sessionCourseInfoSchema,
  sessionApplicationSchema,
  eventSessionApplicationSchema,
  eventSessionApplicationReadSchema,
  eventApplicationSchema,
  eventStep1Schema,
  EVENT_OUTLINE_MAX,
} from "@/lib/forms/event/schemas";
import { applicationDataReadSchema } from "@/lib/forms/application/schemas";

describe("deriveEventType", () => {
  it("maps the two qualifier answers to the four types", () => {
    expect(deriveEventType("FULL", "EVENT_ONLY")).toBe(EventType.FULL_EVENT_QUIZ);
    expect(deriveEventType("FULL", "PER_COURSE")).toBe(EventType.FULL_PER_COURSE);
    expect(deriveEventType("SELECTIVE", "EVENT_ONLY")).toBe(EventType.SELECTIVE_INLINE);
    expect(deriveEventType("SELECTIVE", "PER_COURSE")).toBe(EventType.SELECTIVE_PER_COURSE);
  });
});

describe("type predicates", () => {
  it("isEventOnly is true for the single-application types (consume a credit)", () => {
    expect(isEventOnly(EventType.FULL_EVENT_QUIZ)).toBe(true);
    expect(isEventOnly(EventType.SELECTIVE_INLINE)).toBe(true);
    expect(isEventOnly(EventType.FULL_PER_COURSE)).toBe(false);
    expect(isEventOnly(EventType.SELECTIVE_PER_COURSE)).toBe(false);
  });
  it("isSelective is true for the session-selection types", () => {
    expect(isSelective(EventType.SELECTIVE_INLINE)).toBe(true);
    expect(isSelective(EventType.SELECTIVE_PER_COURSE)).toBe(true);
    expect(isSelective(EventType.FULL_EVENT_QUIZ)).toBe(false);
  });
  it("isPerCourse is true for the reused types", () => {
    expect(isPerCourse(EventType.FULL_PER_COURSE)).toBe(true);
    expect(isPerCourse(EventType.SELECTIVE_PER_COURSE)).toBe(true);
    expect(isPerCourse(EventType.SELECTIVE_INLINE)).toBe(false);
  });
  it("isInlineFullCourse is FULL_EVENT_QUIZ only (SELECTIVE_INLINE is lightweight)", () => {
    expect(isInlineFullCourse(EventType.FULL_EVENT_QUIZ)).toBe(true);
    expect(isInlineFullCourse(EventType.SELECTIVE_INLINE)).toBe(false);
    expect(isInlineFullCourse(EventType.FULL_PER_COURSE)).toBe(false);
    expect(isInlineFullCourse(EventType.SELECTIVE_PER_COURSE)).toBe(false);
  });
});

/*
  Per-session Course Information (step1 shape with half-hour CE hours). One of
  the three slices each SELECTIVE_INLINE session now carries.
*/
const SESSION_INFO = {
  courseTitle: "Intro to Sedation",
  ceCreditHours: 1.5,
  subjectMatter: "Scientific",
  deliveryFormat: "LIVE In Person",
  primaryDistributionFormat: "Live/In Person",
  shortDescription:
    "A focused session on minimal sedation protocols for general practice.",
  publicProtectionStatement:
    "Participants learn monitoring standards that keep sedated patients safe.",
  courseObjectives:
    "1. Select candidates\n2. Monitor sedation\n3. Manage emergencies",
  courseOutline: "Part 1: candidate selection. Part 2: monitoring. Part 3: rescue.",
};

const CREATOR = {
  creatorName: "Dr. Jane Doe",
  credentials: "DDS",
  currentPosition: "Program Director",
  detailedBioHtml: "<p>Twenty years of implant dentistry education and practice.</p>",
  creatorEmail: "jane@example.com",
  creatorPhone: "555-123-4567",
  creatorAddress: "Austin, TX 78701",
  highestDegree: "Doctoral",
  educationPart1: "UT Austin, DDS, 2001",
  educationPart4: "N/A",
  creatorExperience: "20 years placing implants in private practice.",
};

const PRESENTERS = {
  presenters: [
    {
      name: "Dr. Jane Doe",
      role: "Primary Presenter",
      commercialDisclosure: "No relevant financial relationships to disclose",
      experience: "Doe, Jane. 20 years of implant dentistry.",
      training: "4 hours of live train-the-trainer instruction",
      bio: "Dr. Jane Doe, DDS, Program Director.",
    },
  ],
};

// A complete per-session application: Course Info + Creator + Presenters.
const FULL_SESSION = { ...SESSION_INFO, ...CREATOR, ...PRESENTERS };

const MC_QUESTION = {
  type: "MC",
  question: "What is X?",
  options: ["a", "b", "c", "d"],
  correctIndex: 1,
} as const;

const ORG = {
  organizationName: "Texas Dental Association",
  organizationAddress: "Austin, TX 78701",
  adminName: "Jane Admin",
  adminEmail: "admin@example.com",
  adminPhone: "555-000-1111",
};

// FULL_EVENT_QUIZ session application: org (inherited from the event) + the
// full front-half application + a ONE-question MC quiz.
const FULL_EVENT_SESSION = { ...ORG, ...FULL_SESSION, quiz: [MC_QUESTION] };

// Legacy 5-question quiz (2 TF + 3 MC), still valid to keep old data working.
const LEGACY_FIVE_Q_QUIZ = [
  { type: "TF", question: "A true/false question here?", correctAnswer: "True" },
  { type: "TF", question: "Another true/false question?", correctAnswer: "False" },
  MC_QUESTION,
  { ...MC_QUESTION, question: "A second multiple-choice question?" },
  { ...MC_QUESTION, question: "A third multiple-choice question?" },
];

describe("sessionCourseInfoSchema", () => {
  it("accepts a valid step1 slice with half-hour CE hours", () => {
    expect(sessionCourseInfoSchema.safeParse(SESSION_INFO).success).toBe(true);
  });
  it("rejects a non-half-hour CE hours value", () => {
    expect(
      sessionCourseInfoSchema.safeParse({ ...SESSION_INFO, ceCreditHours: 1.25 })
        .success,
    ).toBe(false);
  });
  it("keeps the per-course 20k outline cap", () => {
    expect(
      sessionCourseInfoSchema.safeParse({
        ...SESSION_INFO,
        courseOutline: "x".repeat(20_001),
      }).success,
    ).toBe(false);
  });
});

describe("sessionApplicationSchema (full per-session application)", () => {
  it("accepts a full application: course info + creator + presenters", () => {
    expect(sessionApplicationSchema.safeParse(FULL_SESSION).success).toBe(true);
  });
  it("rejects a step1-only slice (missing creator + presenters)", () => {
    expect(sessionApplicationSchema.safeParse(SESSION_INFO).success).toBe(false);
  });
  it("rejects when the creator slice is missing", () => {
    expect(
      sessionApplicationSchema.safeParse({ ...SESSION_INFO, ...PRESENTERS }).success,
    ).toBe(false);
  });
  it("rejects when the presenters slice is missing", () => {
    expect(
      sessionApplicationSchema.safeParse({ ...SESSION_INFO, ...CREATOR }).success,
    ).toBe(false);
  });
  it("keeps the per-course 20k outline cap (no event-wide outline)", () => {
    expect(
      sessionApplicationSchema.safeParse({
        ...FULL_SESSION,
        courseOutline: "x".repeat(20_001),
      }).success,
    ).toBe(false);
  });
  it("keeps half-hour CE hours", () => {
    expect(
      sessionApplicationSchema.safeParse({ ...FULL_SESSION, ceCreditHours: 1.25 })
        .success,
    ).toBe(false);
  });
});

describe("isInlineSessionComplete", () => {
  it("is true when the full application and question both validate", () => {
    expect(
      isInlineSessionComplete({ courseInfo: FULL_SESSION, question: MC_QUESTION }),
    ).toBe(true);
  });
  it("is false for a step1-only course info (creator/presenters not yet added)", () => {
    expect(
      isInlineSessionComplete({ courseInfo: SESSION_INFO, question: MC_QUESTION }),
    ).toBe(false);
  });
  it("is false for a null or partial courseInfo", () => {
    expect(isInlineSessionComplete({ courseInfo: null, question: MC_QUESTION })).toBe(false);
    expect(
      isInlineSessionComplete({
        courseInfo: { ...FULL_SESSION, shortDescription: "" },
        question: MC_QUESTION,
      }),
    ).toBe(false);
  });
  it("is false when the question has a blank option", () => {
    expect(
      isInlineSessionComplete({
        courseInfo: FULL_SESSION,
        question: { ...MC_QUESTION, options: ["a", "", "c", "d"] },
      }),
    ).toBe(false);
  });
});

describe("inlineSessionSchema", () => {
  const base = {
    courseInfo: FULL_SESSION,
    question: MC_QUESTION,
  };
  it("accepts a valid session (full application + one MC question)", () => {
    expect(inlineSessionSchema.safeParse(base).success).toBe(true);
  });
  it("rejects a step1-only course info", () => {
    expect(
      inlineSessionSchema.safeParse({ ...base, courseInfo: SESSION_INFO }).success,
    ).toBe(false);
  });
  it("rejects a non-half-hour duration", () => {
    expect(
      inlineSessionSchema.safeParse({
        ...base,
        courseInfo: { ...FULL_SESSION, ceCreditHours: 1.25 },
      }).success,
    ).toBe(false);
  });
  it("rejects a question without exactly 4 options", () => {
    expect(
      inlineSessionSchema.safeParse({
        ...base,
        question: { ...base.question, options: ["a", "b", "c"] },
      }).success,
    ).toBe(false);
    expect(
      inlineSessionSchema.safeParse({
        ...base,
        question: { ...base.question, options: ["a", "b", "c", "d", "e"] },
      }).success,
    ).toBe(false);
  });
  it("rejects a blank answer option", () => {
    expect(
      inlineSessionSchema.safeParse({
        ...base,
        question: { ...base.question, options: ["a", "", "c", "d"] },
      }).success,
    ).toBe(false);
  });
  it("rejects an out-of-range or non-integer correct index", () => {
    for (const correctIndex of [4, -1, 1.5]) {
      expect(
        inlineSessionSchema.safeParse({
          ...base,
          question: { ...base.question, correctIndex },
        }).success,
      ).toBe(false);
    }
    for (const correctIndex of [0, 3]) {
      expect(
        inlineSessionSchema.safeParse({
          ...base,
          question: { ...base.question, correctIndex },
        }).success,
      ).toBe(true);
    }
  });
  it("rejects a blank or too-short question", () => {
    expect(
      inlineSessionSchema.safeParse({
        ...base,
        question: { ...base.question, question: "" },
      }).success,
    ).toBe(false);
    expect(
      inlineSessionSchema.safeParse({
        ...base,
        question: { ...base.question, question: "Why?" },
      }).success,
    ).toBe(false);
  });
});

/*
  Legacy read-only schemas (event-level application from before July 2026). Kept
  to keep the two approved production events + older drafts readable.
*/
describe("eventStep1Schema (legacy Event Outline ceiling)", () => {
  it("accepts an outline over the per-course 20k cap up to EVENT_OUTLINE_MAX", () => {
    expect(
      eventStep1Schema.safeParse({
        ...SESSION_INFO,
        courseOutline: "x".repeat(150_000),
      }).success,
    ).toBe(true);
  });
  it("rejects an outline over EVENT_OUTLINE_MAX", () => {
    expect(
      eventStep1Schema.safeParse({
        ...SESSION_INFO,
        courseOutline: "x".repeat(EVENT_OUTLINE_MAX + 1),
      }).success,
    ).toBe(false);
  });
});

describe("eventApplicationSchema (legacy read)", () => {
  it("accepts the merged Course Info + Creator + Presenters slices (no quiz)", () => {
    expect(eventApplicationSchema.safeParse(FULL_SESSION).success).toBe(true);
  });
  it("rejects when a required field is missing", () => {
    const rest = Object.fromEntries(
      Object.entries(SESSION_INFO).filter(([k]) => k !== "courseTitle"),
    );
    expect(
      eventApplicationSchema.safeParse({ ...rest, ...CREATOR, ...PRESENTERS }).success,
    ).toBe(false);
  });
});

describe("event-application reviewer read path", () => {
  it("a complete application parses with applicationDataReadSchema minus the quiz", () => {
    // Mirrors the reviewer/company detail pages: a legacy eventApplication OR a
    // new per-session course_info reads tolerantly with the quiz half omitted.
    const parsed = applicationDataReadSchema.omit({ quiz: true }).safeParse(FULL_SESSION);
    expect(parsed.success).toBe(true);
  });
  it("does not parse an empty object (legacy/partial rows fall back)", () => {
    expect(
      applicationDataReadSchema.omit({ quiz: true }).safeParse({}).success,
    ).toBe(false);
  });
  it("does not parse a step1-only slice (fallback to sessionCourseInfoRows)", () => {
    expect(
      applicationDataReadSchema.omit({ quiz: true }).safeParse(SESSION_INFO).success,
    ).toBe(false);
  });
});

describe("eventSessionApplicationSchema (FULL_EVENT_QUIZ, single MC question)", () => {
  it("accepts a full session with a one-question MC quiz", () => {
    expect(eventSessionApplicationSchema.safeParse(FULL_EVENT_SESSION).success).toBe(true);
  });
  it("still accepts a legacy 5-question quiz (tolerant of old event sessions)", () => {
    expect(
      eventSessionApplicationSchema.safeParse({
        ...FULL_EVENT_SESSION,
        quiz: LEGACY_FIVE_Q_QUIZ,
      }).success,
    ).toBe(true);
  });
  it("rejects an empty quiz", () => {
    expect(
      eventSessionApplicationSchema.safeParse({ ...FULL_EVENT_SESSION, quiz: [] }).success,
    ).toBe(false);
  });
  it("rejects a quiz with no multiple-choice question", () => {
    expect(
      eventSessionApplicationSchema.safeParse({
        ...FULL_EVENT_SESSION,
        quiz: [{ type: "TF", question: "Only a true/false question?", correctAnswer: "True" }],
      }).success,
    ).toBe(false);
  });
  it("rejects when the front-half application is incomplete (missing creator)", () => {
    const { creatorName: _omit, ...rest } = FULL_EVENT_SESSION;
    void _omit;
    expect(eventSessionApplicationSchema.safeParse(rest).success).toBe(false);
  });
  it("reads via eventSessionApplicationReadSchema (variable-length quiz), while the shared read schema stays strict-5", () => {
    // Event detail pages + approveEvent parse session applications with the
    // event read schema, so a one-question quiz stays readable there...
    expect(
      eventSessionApplicationReadSchema.safeParse(FULL_EVENT_SESSION).success,
    ).toBe(true);
    // ...but the SHARED applicationDataReadSchema stays strict (exactly 5,
    // TF/TF/MC/MC/MC), so standalone course approval keeps its 5-question gate.
    expect(applicationDataReadSchema.safeParse(FULL_EVENT_SESSION).success).toBe(false);
    expect(
      applicationDataReadSchema.safeParse({
        ...FULL_EVENT_SESSION,
        quiz: LEGACY_FIVE_Q_QUIZ,
      }).success,
    ).toBe(true);
  });
  it("keeps the write gate's quiz floor on the read path (approveEvent can't accredit an empty/no-MC quiz)", () => {
    // A legacy 5-question quiz still reads fine...
    expect(
      eventSessionApplicationReadSchema.safeParse({
        ...FULL_EVENT_SESSION,
        quiz: LEGACY_FIVE_Q_QUIZ,
      }).success,
    ).toBe(true);
    // ...but an empty quiz, or a quiz with no MC, is rejected at read/approval.
    expect(
      eventSessionApplicationReadSchema.safeParse({ ...FULL_EVENT_SESSION, quiz: [] })
        .success,
    ).toBe(false);
    expect(
      eventSessionApplicationReadSchema.safeParse({
        ...FULL_EVENT_SESSION,
        quiz: [{ type: "TF", question: "Only a true/false question?", correctAnswer: "True" }],
      }).success,
    ).toBe(false);
  });
});

/*
  Event billing. Regression guard for the 2026-06-30 -> 2026-07-29 defect where
  submitEvent charged one credit PER SESSION while the qualifier screen promised
  "accredited as a single application", billing an 8-session event 8 credits for
  a single Event ID.
*/
describe("eventCreditCost", () => {
  it("charges one credit for event-only types", () => {
    expect(eventCreditCost(EventType.FULL_EVENT_QUIZ)).toBe(1);
    expect(eventCreditCost(EventType.SELECTIVE_INLINE)).toBe(1);
  });

  it("charges nothing for per-course types (their courses were already paid)", () => {
    expect(eventCreditCost(EventType.FULL_PER_COURSE)).toBe(0);
    expect(eventCreditCost(EventType.SELECTIVE_PER_COURSE)).toBe(0);
  });

  it("agrees with isEventOnly for every event type", () => {
    for (const type of Object.values(EventType)) {
      expect(eventCreditCost(type)).toBe(isEventOnly(type) ? 1 : 0);
    }
  });
});
