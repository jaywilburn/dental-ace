import { describe, it, expect } from "vitest";
import { EventType } from "@prisma/client";
import {
  deriveEventType,
  isEventOnly,
  isSelective,
  isPerCourse,
  isInlineFullCourse,
  inlineSessionSchema,
  inlineSessionsSchema,
  eventApplicationSchema,
  eventApplicationStepRoute,
  isEventApplicationComplete,
  nextEventApplicationStep,
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

describe("inlineSessionSchema", () => {
  const base = {
    name: "Intro to Sedation",
    durationHours: 1.5,
    question: { type: "MC", question: "What is X?", options: ["a", "b", "c", "d"], correctIndex: 1 },
  };
  it("accepts a valid 0.5-increment session", () => {
    expect(inlineSessionSchema.safeParse(base).success).toBe(true);
  });
  it("rejects a non-half-hour duration", () => {
    expect(inlineSessionSchema.safeParse({ ...base, durationHours: 1.25 }).success).toBe(false);
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
  SELECTIVE_INLINE event-level application (Course Info + Creator + Presenters,
  entered once per event, stored under eventData.eventApplication). Fixtures
  are valid per-step slices of the shared course-application schemas.
*/
const COURSE_INFO = {
  courseTitle: "Implant Dentistry Update",
  ceCreditHours: 3,
  subjectMatter: "Scientific",
  deliveryFormat: "LIVE In Person",
  primaryDistributionFormat: "Live/In Person",
  shortDescription:
    "A concise overview of modern implant workflows for the general practitioner.",
  publicProtectionStatement:
    "Participants learn safer implant placement protocols that protect patients.",
  courseObjectives:
    "1. Plan implant cases\n2. Place implants safely\n3. Manage complications",
  courseOutline: "Hour 1: planning. Hour 2: placement. Hour 3: complications.",
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

describe("eventApplicationSchema", () => {
  it("accepts the merged Course Info + Creator + Presenters slices (no quiz)", () => {
    expect(
      eventApplicationSchema.safeParse({ ...COURSE_INFO, ...CREATOR, ...PRESENTERS })
        .success,
    ).toBe(true);
  });
  it("rejects when a required field is missing", () => {
    const rest = Object.fromEntries(
      Object.entries(COURSE_INFO).filter(([k]) => k !== "courseTitle"),
    );
    expect(
      eventApplicationSchema.safeParse({ ...rest, ...CREATOR, ...PRESENTERS }).success,
    ).toBe(false);
  });
});

describe("nextEventApplicationStep / isEventApplicationComplete", () => {
  it("routes an empty or missing application to the course step", () => {
    expect(nextEventApplicationStep(undefined)).toBe("course");
    expect(nextEventApplicationStep({})).toBe("course");
    expect(isEventApplicationComplete(undefined)).toBe(false);
  });
  it("walks the steps in order as each slice completes", () => {
    expect(nextEventApplicationStep({ ...COURSE_INFO })).toBe("creator");
    expect(nextEventApplicationStep({ ...COURSE_INFO, ...CREATOR })).toBe("presenters");
    expect(
      nextEventApplicationStep({ ...COURSE_INFO, ...CREATOR, ...PRESENTERS }),
    ).toBe(null);
  });
  it("returns the earliest broken step even when later slices are valid", () => {
    expect(
      nextEventApplicationStep({
        ...COURSE_INFO,
        ...CREATOR,
        ...PRESENTERS,
        courseTitle: "",
      }),
    ).toBe("course");
  });
  it("is complete only when all three slices validate", () => {
    expect(
      isEventApplicationComplete({ ...COURSE_INFO, ...CREATOR, ...PRESENTERS }),
    ).toBe(true);
    expect(isEventApplicationComplete({ ...COURSE_INFO, ...CREATOR })).toBe(false);
  });
});

describe("event-application reviewer read path", () => {
  it("a complete eventApplication parses with applicationDataReadSchema minus the quiz", () => {
    // Mirrors app/reviewer/events/[id]/page.tsx: the lightweight branch reads
    // eventData.eventApplication tolerantly, with the quiz half omitted (the
    // per-session questions replace it).
    const parsed = applicationDataReadSchema
      .omit({ quiz: true })
      .safeParse({ ...COURSE_INFO, ...CREATOR, ...PRESENTERS });
    expect(parsed.success).toBe(true);
  });
  it("does not parse an absent eventApplication (legacy events hide the sections)", () => {
    expect(
      applicationDataReadSchema.omit({ quiz: true }).safeParse({}).success,
    ).toBe(false);
  });
});

describe("eventApplicationStepRoute", () => {
  it("maps each step slug to its wizard route", () => {
    expect(eventApplicationStepRoute("course")).toBe("/company/events/new/course");
    expect(eventApplicationStepRoute("creator")).toBe("/company/events/new/creator");
    expect(eventApplicationStepRoute("presenters")).toBe(
      "/company/events/new/presenters",
    );
  });
});

describe("inlineSessionsSchema", () => {
  const session = {
    name: "Intro to Sedation",
    durationHours: 1.5,
    question: { type: "MC", question: "What is X?", options: ["a", "b", "c", "d"], correctIndex: 1 },
  };
  it("requires at least one session and caps at 20", () => {
    expect(inlineSessionsSchema.safeParse({ sessions: [] }).success).toBe(false);
    expect(inlineSessionsSchema.safeParse({ sessions: [session] }).success).toBe(true);
    expect(
      inlineSessionsSchema.safeParse({ sessions: Array.from({ length: 21 }, () => session) })
        .success,
    ).toBe(false);
  });
});
