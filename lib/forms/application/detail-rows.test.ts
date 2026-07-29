import { describe, expect, it } from "vitest";
import {
  applicationDataReadSchema,
  type ApplicationDataRead,
} from "@/lib/forms/application/schemas";
import {
  courseInfoRows,
  creatorRows,
  organizationRows,
  presenterRows,
  sessionCourseInfoRows,
} from "@/lib/forms/application/detail-rows";

/*
  Row builders shared by the reviewer detail page and the company read-only
  application view. The cases that matter: legacy applications (pre-2026-06
  fields missing or retired) must not produce empty/crashing rows, live
  formats add the combined-cert rows, and the rich-text bio row is sanitized
  html.
*/

const quiz = [
  { type: "TF", question: "Is flossing recommended daily?", correctAnswer: "True" },
  { type: "TF", question: "Are sealants permanent?", correctAnswer: "False" },
  {
    type: "MC",
    question: "Which mineral strengthens enamel?",
    options: ["Fluoride", "Iron", "Zinc", "Copper"],
    correctIndex: 0,
  },
  {
    type: "MC",
    question: "How often should radiographs be reviewed?",
    options: ["Never", "Annually", "Per risk assessment", "Monthly"],
    correctIndex: 2,
  },
  {
    type: "MC",
    question: "What is the first step of an exam?",
    options: ["Health history", "Polishing", "Sealants", "Whitening"],
    correctIndex: 0,
  },
];

function parseRead(overrides: Record<string, unknown> = {}): ApplicationDataRead {
  const base = {
    courseTitle: "Modern Periodontal Therapy",
    ceCreditHours: 2.5,
    subjectMatter: "Scientific",
    deliveryFormat: "On Demand Video",
    publicProtectionStatement:
      "This course improves patient safety through evidence-based protocols.",
    courseObjectives:
      "1. Describe etiology. 2. Apply staging. 3. Plan maintenance intervals.",
    creatorName: "Dr. Jane Rivera",
    credentials: "DDS, MS",
    currentPosition: "Clinical Director, Rivera Dental Institute",
    quiz,
  };
  const result = applicationDataReadSchema.safeParse({ ...base, ...overrides });
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}

describe("organizationRows", () => {
  it("returns no rows for legacy applications missing the 2026-06 org fields", () => {
    expect(organizationRows(parseRead())).toEqual([]);
  });

  it("returns the org rows when present", () => {
    const rows = organizationRows(
      parseRead({
        organizationName: "Texas Dental Association",
        organizationAddress: "123 Main St, Austin, TX 78701",
        adminName: "Pat Admin",
        adminEmail: "pat@example.com",
        adminPhone: "512-555-0100",
      }),
    );
    expect(rows.map((r) => r.label)).toEqual([
      "Organization",
      "Address",
      "Process Administrator",
      "Admin Email",
      "Admin Phone",
    ]);
  });
});

describe("courseInfoRows", () => {
  it("never emits a Target Audience row, even when legacy JSON carries one", () => {
    const labels = courseInfoRows(
      parseRead({ targetAudience: "General Dentists" }),
    ).map((r) => r.label);
    expect(labels).not.toContain("Target Audience");
  });

  it("omits legacy duration and ADA CERP rows when absent", () => {
    const labels = courseInfoRows(parseRead()).map((r) => r.label);
    expect(labels).not.toContain("Course Duration");
    expect(labels).not.toContain("ADA CERP Category");
  });

  it("includes legacy duration and ADA CERP rows when present", () => {
    const labels = courseInfoRows(
      parseRead({ courseDurationHours: 3, adaCerpCategory: "Category 1" }),
    ).map((r) => r.label);
    expect(labels).toContain("Course Duration");
    expect(labels).toContain("ADA CERP Category");
  });

  it("shows the course outline row only for the current text form", () => {
    // Absent (legacy application without an outline) — no row.
    expect(courseInfoRows(parseRead()).map((r) => r.label)).not.toContain(
      "Course Outline",
    );
    // Legacy uploaded fileRef — no text row (rendered via Attachments instead).
    const legacy = courseInfoRows(
      parseRead({
        courseOutline: {
          storagePath: "applications/x/courseOutline/1-o.pdf",
          filename: "o.pdf",
          uploadedAt: "2026-05-01T00:00:00.000Z",
        },
      }),
    ).map((r) => r.label);
    expect(legacy).not.toContain("Course Outline");
    // Current text form — full-width text row.
    const current = courseInfoRows(
      parseRead({ courseOutline: "1. Intro\n2. Protocols" }),
    );
    expect(current.find((r) => r.label === "Course Outline")?.value).toBe(
      "1. Intro\n2. Protocols",
    );
  });

  it("formats CE hours to one decimal place", () => {
    const row = courseInfoRows(parseRead()).find(
      (r) => r.label === "CE Credit Hours",
    );
    expect(row?.value).toBe("2.5 hours");
  });

  it("relabels the outline row when outlineLabel is passed (event-level applications)", () => {
    const rows = courseInfoRows(
      parseRead({ courseOutline: "Day 1: sessions. Day 2: workshops." }),
      { outlineLabel: "Event Outline" },
    );
    expect(rows.find((r) => r.label === "Event Outline")?.value).toBe(
      "Day 1: sessions. Day 2: workshops.",
    );
    expect(rows.map((r) => r.label)).not.toContain("Course Outline");
    // Default stays "Course Outline" for regular applications.
    const defaults = courseInfoRows(parseRead({ courseOutline: "Outline text" }));
    expect(defaults.map((r) => r.label)).toContain("Course Outline");
  });
});

describe("sessionCourseInfoRows", () => {
  it("renders all rows for a full per-session slice", () => {
    const rows = sessionCourseInfoRows({
      courseTitle: "Intro to Sedation",
      ceCreditHours: 1.5,
      subjectMatter: "Scientific",
      deliveryFormat: "LIVE In Person",
      primaryDistributionFormat: "Live/In Person",
      shortDescription: "A focused session on sedation protocols.",
      publicProtectionStatement: "Keeps sedated patients safe.",
      courseObjectives: "1. Learn A\n2. Apply B",
      courseOutline: "Part 1: overview.",
    });
    expect(rows.map((r) => r.label)).toEqual([
      "Course Title",
      "CE Credit Hours",
      "Category",
      "Course Format",
      "Most-Used Format",
      "Short Description",
      "Public Protection Statement",
      "Course Objectives",
      "Course Outline",
    ]);
    expect(rows.find((r) => r.label === "CE Credit Hours")?.value).toBe("1.5 hours");
  });

  it("skips missing fields instead of crashing (sessions saved before per-session info)", () => {
    expect(sessionCourseInfoRows({})).toEqual([]);
    const partial = sessionCourseInfoRows({ courseTitle: "Only a title" });
    expect(partial.map((r) => r.label)).toEqual(["Course Title"]);
  });
});

describe("creatorRows", () => {
  it("renders the rich-text bio as a sanitized html row", () => {
    const rows = creatorRows(
      parseRead({
        detailedBioHtml:
          "<p>Dr. Rivera</p><script>alert(1)</script><a href='https://x.test'>link</a>",
      }),
    );
    const bio = rows.find((r) => r.label === "Detailed Bio");
    expect(bio?.html).toBe(true);
    expect(bio?.value).toContain("<p>Dr. Rivera</p>");
    expect(bio?.value).not.toContain("script");
    expect(bio?.value).not.toContain("<a");
  });

  it("renders the legacy plain-text bio as a non-html row", () => {
    const rows = creatorRows(
      parseRead({ professionalBio: "Plain text bio from 2025." }),
    );
    const bio = rows.find((r) => r.label === "Professional Bio");
    expect(bio?.html).toBeUndefined();
    expect(bio?.value).toBe("Plain text bio from 2025.");
  });

  it("omits optional creator contact rows for legacy applications", () => {
    const labels = creatorRows(parseRead()).map((r) => r.label);
    expect(labels).toEqual(["Creator Name", "Credentials", "Current Position"]);
  });

  it("shows the CV / resume row only for the current text form", () => {
    // Legacy uploaded fileRef — no text row (rendered via Attachments instead).
    const legacy = creatorRows(
      parseRead({
        cvResume: {
          storagePath: "applications/x/cvResume/1-cv.pdf",
          filename: "cv.pdf",
          uploadedAt: "2026-05-01T00:00:00.000Z",
        },
      }),
    ).map((r) => r.label);
    expect(legacy).not.toContain("CV / Resume");
    // Current text form — full-width text row.
    const current = creatorRows(parseRead({ cvResume: "DDS Baylor 2005." }));
    expect(current.find((r) => r.label === "CV / Resume")?.value).toBe(
      "DDS Baylor 2005.",
    );
  });
});

describe("presenterRows", () => {
  it("returns no rows when the legacy application has no presenters array", () => {
    expect(presenterRows(parseRead())).toEqual([]);
  });

  it("emits only the header row for legacy presenters without detail fields", () => {
    const rows = presenterRows(
      parseRead({ presenters: [{ name: "Dr. Lee", role: "Primary Presenter" }] }),
    );
    expect(rows).toEqual([
      { label: "Presenter 1", value: "Dr. Lee · Primary Presenter" },
    ]);
  });

  it("emits the detail rows per presenter when present", () => {
    const rows = presenterRows(
      parseRead({
        presenters: [
          {
            name: "Dr. Lee",
            role: "Primary Presenter",
            commercialDisclosure: "No commercial interests.",
            experience: "10 years in periodontics.",
            training: "Board certification training.",
            bio: "Practicing periodontist in Austin.",
          },
          { name: "Dr. Kim", role: "Co-Presenter" },
        ],
      }),
    );
    expect(rows.map((r) => r.label)).toEqual([
      "Presenter 1",
      "Commercial Disclosure",
      "Experience",
      "Training Received",
      "Bio",
      "Presenter 2",
    ]);
  });
});

describe("organizationRows accepts a bare org slice", () => {
  // Events keep org/contact on Event.eventData, not in an application blob, so
  // the builder takes a structural OrganizationFields rather than the full
  // ApplicationDataRead. This proves the widening holds.
  it("builds rows from a plain object with no application fields", () => {
    const rows = organizationRows({
      organizationName: "Smile Together",
      organizationAddress: "Austin, TX 78703",
      adminName: "Julia Behr",
      adminEmail: "julia@example.com",
      adminPhone: "512-538-4095",
    });
    expect(rows.map((r) => r.label)).toEqual([
      "Organization",
      "Address",
      "Process Administrator",
      "Admin Email",
      "Admin Phone",
    ]);
  });

  it("skips absent fields instead of emitting empty rows", () => {
    expect(organizationRows({ organizationName: "Smile Together" })).toHaveLength(1);
    expect(organizationRows({})).toEqual([]);
  });
});
