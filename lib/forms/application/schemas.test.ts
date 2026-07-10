import { describe, it, expect } from "vitest";
import {
  COURSE_FORMATS,
  DELIVERY_FORMATS,
  HIGHEST_DEGREES,
  isLiveFormat,
  orgStepSchema,
  step1Schema,
  step2Schema,
  presenterSchema,
  applicationDataReadSchema,
} from "@/lib/forms/application/schemas";

describe("delivery formats", () => {
  it("uses the 5 granular options", () => {
    expect(DELIVERY_FORMATS).toEqual([
      "Live/In Person",
      "Live/Online",
      "On Demand Video",
      "On Demand Audio",
      "Printed Course",
    ]);
  });

  it("exposes exactly the four canonical Course Format options", () => {
    expect(COURSE_FORMATS).toEqual([
      "LIVE In Person",
      "LIVE Online",
      "On Demand Recording",
      "Self Study/Printed",
    ]);
  });

  it("treats new and legacy live values as live", () => {
    // New canonical live values.
    expect(isLiveFormat("LIVE In Person")).toBe(true);
    expect(isLiveFormat("LIVE Online")).toBe(true);
    // Pre-2026-06 forms.
    expect(isLiveFormat("Live/In Person")).toBe(true);
    expect(isLiveFormat("Live/Online")).toBe(true);
    // Retired legacy values.
    expect(isLiveFormat("Live/Virtual")).toBe(true);
    expect(isLiveFormat("Live Event")).toBe(true);
    // Non-live canonical + legacy values.
    expect(isLiveFormat("On Demand Recording")).toBe(false);
    expect(isLiveFormat("Self Study/Printed")).toBe(false);
    expect(isLiveFormat("On Demand Video")).toBe(false);
    expect(isLiveFormat("Printed Course")).toBe(false);
  });
});

describe("orgStepSchema", () => {
  it("accepts a valid org/contact slice", () => {
    expect(
      orgStepSchema.safeParse({
        organizationName: "Texas Dental Association",
        organizationAddress: "100 Main St, Austin, TX 78701",
        adminName: "Jane Roe",
        adminEmail: "jane@example.com",
        adminPhone: "512-555-0100",
      }).success,
    ).toBe(true);
  });

  it("rejects a bad admin email", () => {
    const r = orgStepSchema.safeParse({
      organizationName: "Org",
      organizationAddress: "100 Main St, Austin, TX 78701",
      adminName: "Jane Roe",
      adminEmail: "not-an-email",
      adminPhone: "512-555-0100",
    });
    expect(r.success).toBe(false);
  });
});

describe("step1Schema additions", () => {
  const base = {
    courseTitle: "Infection Control",
    ceCreditHours: 1.5,
    subjectMatter: "Scientific",
    // deliveryFormat is now one of the four canonical COURSE_FORMATS;
    // primaryDistributionFormat still uses the granular DELIVERY_FORMATS.
    deliveryFormat: "LIVE Online",
    publicProtectionStatement: "x".repeat(20),
    courseObjectives: "x".repeat(20),
    courseOutline: "1. Introduction\n2. Protocols\n3. Q&A",
  };

  it("requires shortDescription and primaryDistributionFormat", () => {
    expect(step1Schema.safeParse(base).success).toBe(false);
    expect(
      step1Schema.safeParse({
        ...base,
        shortDescription: "y".repeat(20),
        primaryDistributionFormat: "Live/Online",
      }).success,
    ).toBe(true);
  });

  it("rejects a deliveryFormat outside the four canonical options", () => {
    expect(
      step1Schema.safeParse({
        ...base,
        deliveryFormat: "Live/Online", // legacy DELIVERY_FORMATS value
        shortDescription: "y".repeat(20),
        primaryDistributionFormat: "Live/Online",
      }).success,
    ).toBe(false);
  });

  it("requires the course outline as text (no longer an upload)", () => {
    const full = {
      ...base,
      shortDescription: "y".repeat(20),
      primaryDistributionFormat: "Live/Online",
    };
    expect(step1Schema.safeParse({ ...full, courseOutline: "" }).success).toBe(false);
    expect(
      step1Schema.safeParse({
        ...full,
        courseOutline: { storagePath: "p", filename: "f.pdf", uploadedAt: "now" },
      }).success,
    ).toBe(false);
  });
});

describe("step2Schema additions", () => {
  const base = {
    creatorName: "Dr. Smith",
    credentials: "DDS",
    currentPosition: "Professor",
    detailedBioHtml: "<p>bio text here</p>",
    creatorEmail: "smith@example.com",
    creatorPhone: "512-555-0101",
    creatorAddress: "200 Oak St, Dallas, TX 75201",
    highestDegree: "Doctoral",
    educationPart1: "DDS, Baylor, 2005",
    creatorExperience: "Ten years of clinical research.",
  };

  it("accepts when only Part 1 of education is provided", () => {
    expect(step2Schema.safeParse(base).success).toBe(true);
  });

  it("defaults educationPart4 to N/A", () => {
    const parsed = step2Schema.parse(base);
    expect(parsed.educationPart4).toBe("N/A");
  });

  it("rejects an invalid highest degree", () => {
    expect(
      step2Schema.safeParse({ ...base, highestDegree: "PhD" }).success,
    ).toBe(false);
  });
});

describe("presenterSchema additions", () => {
  it("requires experience, training, and bio", () => {
    const r = presenterSchema.safeParse({
      name: "Dr. Smith",
      role: "Primary Presenter",
      commercialDisclosure: "None",
    });
    expect(r.success).toBe(false);
    expect(
      presenterSchema.safeParse({
        name: "Dr. Smith",
        role: "Primary Presenter",
        commercialDisclosure: "None",
        experience: "15 years lecturing",
        training: "Live train-the-trainer, 8 hours",
        bio: "Board-certified periodontist.",
      }).success,
    ).toBe(true);
  });
});

describe("applicationDataReadSchema tolerance", () => {
  it("parses a legacy application missing all new fields", () => {
    const legacy = {
      courseTitle: "Old Course",
      ceCreditHours: 2,
      subjectMatter: "Scientific",
      deliveryFormat: "Live Event",
      // Retired 2026-06; pre-removal applications still carry it.
      targetAudience: "General Dentists",
      publicProtectionStatement: "x".repeat(20),
      courseObjectives: "x".repeat(20),
      creatorName: "Dr. Old",
      credentials: "DDS",
      currentPosition: "Retired",
      detailedBioHtml: "<p>bio</p>",
      presenters: [
        { name: "Dr. Old", role: "Primary Presenter", commercialDisclosure: "None" },
      ],
      // Quiz isn't a new field; real legacy apps always carry the 5 questions.
      quiz: [
        { type: "TF", question: "Question one?", correctAnswer: "True" },
        { type: "TF", question: "Question two?", correctAnswer: "False" },
        { type: "MC", question: "Question three?", options: ["a", "b", "c", "d"], correctIndex: 0 },
        { type: "MC", question: "Question four?", options: ["a", "b", "c", "d"], correctIndex: 1 },
        { type: "MC", question: "Question five?", options: ["a", "b", "c", "d"], correctIndex: 2 },
      ],
    };
    expect(applicationDataReadSchema.safeParse(legacy).success).toBe(true);

    // The retired targetAudience field is optional on read: current
    // applications omit it entirely.
    const withoutTargetAudience: Record<string, unknown> = { ...legacy };
    delete withoutTargetAudience.targetAudience;
    expect(
      applicationDataReadSchema.safeParse(withoutTargetAudience).success,
    ).toBe(true);
  });

  it("accepts legacy uploaded outline/CV fileRefs and current text values", () => {
    const base = {
      courseTitle: "Old Course",
      ceCreditHours: 2,
      subjectMatter: "Scientific",
      deliveryFormat: "Live Event",
      publicProtectionStatement: "x".repeat(20),
      courseObjectives: "x".repeat(20),
      creatorName: "Dr. Old",
      credentials: "DDS",
      currentPosition: "Retired",
      detailedBioHtml: "<p>bio</p>",
      quiz: [
        { type: "TF", question: "Question one?", correctAnswer: "True" },
        { type: "TF", question: "Question two?", correctAnswer: "False" },
        { type: "MC", question: "Question three?", options: ["a", "b", "c", "d"], correctIndex: 0 },
        { type: "MC", question: "Question four?", options: ["a", "b", "c", "d"], correctIndex: 1 },
        { type: "MC", question: "Question five?", options: ["a", "b", "c", "d"], correctIndex: 2 },
      ],
    };
    const fileRef = {
      storagePath: "applications/x/courseOutline/1-outline.pdf",
      filename: "outline.pdf",
      uploadedAt: "2026-05-01T00:00:00.000Z",
    };
    // Legacy upload form.
    expect(
      applicationDataReadSchema.safeParse({
        ...base,
        courseOutline: fileRef,
        cvResume: fileRef,
      }).success,
    ).toBe(true);
    // Current text form.
    expect(
      applicationDataReadSchema.safeParse({
        ...base,
        courseOutline: "1. Intro\n2. Protocols",
        cvResume: "DDS Baylor 2005.",
      }).success,
    ).toBe(true);
  });

  it("exposes HIGHEST_DEGREES options", () => {
    expect(HIGHEST_DEGREES).toContain("None of the Above");
  });
});
