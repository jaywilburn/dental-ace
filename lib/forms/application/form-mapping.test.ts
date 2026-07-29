import { describe, it, expect } from "vitest";
import {
  orgRawFromForm,
  courseInfoRawFromForm,
  creatorRawFromForm,
  presentersRawFromForm,
} from "@/lib/forms/application/form-mapping";
import {
  step1Schema,
  step2Schema,
  step3Schema,
} from "@/lib/forms/application/schemas";

/*
  The FormData -> raw-slice mappers must produce exactly what the step schemas
  expect (they are the shared front half of both the standalone application
  wizard and the SELECTIVE_INLINE event-level application steps).
*/

function formDataFrom(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

const COURSE_FIELDS = {
  courseTitle: "Implant Dentistry Update",
  ceCreditHours: "3",
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

const CREATOR_FIELDS = {
  creatorName: "Dr. Jane Doe",
  credentials: "DDS",
  currentPosition: "Program Director",
  creatorEmail: "jane@example.com",
  creatorPhone: "555-123-4567",
  creatorAddress: "Austin, TX 78701",
  highestDegree: "Doctoral",
  educationPart1: "UT Austin, DDS, 2001",
  creatorExperience: "20 years placing implants in private practice.",
};

const BIO_HTML = "<p>Twenty years of implant dentistry education and practice.</p>";

const PRESENTER_FIELDS = {
  presenter_0_name: "Dr. Jane Doe",
  presenter_0_role: "Primary Presenter",
  presenter_0_commercialDisclosure: "No relevant financial relationships to disclose",
  presenter_0_experience: "Doe, Jane. 20 years of implant dentistry.",
  presenter_0_training: "4 hours of live train-the-trainer instruction",
  presenter_0_bio: "Dr. Jane Doe, DDS, Program Director.",
};

describe("courseInfoRawFromForm", () => {
  it("maps the Course Information fields into a valid step1 slice", () => {
    const raw = courseInfoRawFromForm(formDataFrom(COURSE_FIELDS));
    const parsed = step1Schema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.courseTitle).toBe("Implant Dentistry Update");
      expect(parsed.data.ceCreditHours).toBe(3); // numeric coercion
    }
  });
  it("produces a slice the schema rejects when a required field is blank", () => {
    const raw = courseInfoRawFromForm(
      formDataFrom({ ...COURSE_FIELDS, courseTitle: "" }),
    );
    expect(step1Schema.safeParse(raw).success).toBe(false);
  });
  it("reads prefixed field names when a prefix is passed (inline sessions form)", () => {
    const prefixed = Object.fromEntries(
      Object.entries(COURSE_FIELDS).map(([k, v]) => [`s0_${k}`, v]),
    );
    const raw = courseInfoRawFromForm(formDataFrom(prefixed), "s0_");
    const parsed = step1Schema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.courseTitle).toBe("Implant Dentistry Update");
    }
    // Without the prefix the same form yields an empty (invalid) slice.
    expect(step1Schema.safeParse(courseInfoRawFromForm(formDataFrom(prefixed))).success).toBe(false);
  });
});

describe("creatorRawFromForm", () => {
  it("maps the Creator fields (plus sanitized bio) into a valid step2 slice", () => {
    const raw = creatorRawFromForm(formDataFrom(CREATOR_FIELDS), BIO_HTML);
    const parsed = step2Schema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.detailedBioHtml).toBe(BIO_HTML);
  });
  it("turns blank optional education parts into undefined and defaults part 4 to N/A", () => {
    const raw = creatorRawFromForm(
      formDataFrom({ ...CREATOR_FIELDS, educationPart2: "", educationPart4: "" }),
      BIO_HTML,
    );
    expect(raw.educationPart2).toBeUndefined();
    expect(raw.educationPart3).toBeUndefined();
    expect(raw.educationPart4).toBe("N/A");
    expect(step2Schema.safeParse(raw).success).toBe(true);
  });
});

describe("presentersRawFromForm", () => {
  it("maps the primary-presenter fields into a valid step3 slice", () => {
    const raw = presentersRawFromForm(formDataFrom(PRESENTER_FIELDS));
    const parsed = step3Schema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.presenters).toHaveLength(1);
      expect(parsed.data.presenters[0].role).toBe("Primary Presenter");
    }
  });
  it("defaults a missing role to Primary Presenter", () => {
    const rest = Object.fromEntries(
      Object.entries(PRESENTER_FIELDS).filter(([k]) => k !== "presenter_0_role"),
    );
    const raw = presentersRawFromForm(formDataFrom(rest));
    expect(raw.presenters[0].role).toBe("Primary Presenter");
    expect(step3Schema.safeParse(raw).success).toBe(true);
  });
});

/*
  Normalization. The builders are the ONLY place raw wizard strings are built,
  which is what makes normalizeFormText impossible to miss; see its doc comment
  for why un-normalized textarea input fails a server cap the browser accepted.
*/
describe("normalization", () => {
  function fd(fields: Record<string, string>): FormData {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  }

  it("folds CRLF to LF in course-info text so browser and server caps agree", () => {
    const raw = courseInfoRawFromForm(
      fd({ courseObjectives: "1. A\r\n2. B\r\n3. C", courseOutline: "Part 1\r\nPart 2" }),
    );
    expect(raw.courseObjectives).toBe("1. A\n2. B\n3. C");
    expect(raw.courseOutline).toBe("Part 1\nPart 2");
  });

  it("brings a CRLF-inflated field back under its cap", () => {
    // 1,500 chars + 500 newlines is exactly 2,000 in the browser but 2,500 on
    // the wire, which used to fail courseObjectives' .max(2000).
    const browserValue = "x".repeat(1500) + "\n".repeat(500);
    const raw = courseInfoRawFromForm(
      fd({ courseObjectives: browserValue.replace(/\n/g, "\r\n") }),
    );
    expect(raw.courseObjectives.length).toBeLessThanOrEqual(2000);
  });

  it("trims surrounding whitespace", () => {
    expect(orgRawFromForm(fd({ adminEmail: "  admin@example.com  " })).adminEmail).toBe(
      "admin@example.com",
    );
  });

  it("treats a whitespace-only optional education entry as cleared", () => {
    const raw = creatorRawFromForm(fd({ educationPart2: "   ", educationPart3: "" }), "<p>b</p>");
    expect(raw.educationPart2).toBeUndefined();
    expect(raw.educationPart3).toBeUndefined();
    // educationPart4 keeps its "N/A" default.
    expect(raw.educationPart4).toBe("N/A");
  });

  it("normalizes presenter text", () => {
    const raw = presentersRawFromForm(fd({ presenter_0_bio: "  Line 1\r\nLine 2  " }));
    expect(raw.presenters[0].bio).toBe("Line 1\nLine 2");
  });

  it("defaults a missing presenter role rather than posting an empty enum", () => {
    expect(presentersRawFromForm(fd({})).presenters[0].role).toBe("Primary Presenter");
  });

  it("maps every org field", () => {
    expect(
      orgRawFromForm(
        fd({
          organizationName: "Texas Dental Association",
          organizationAddress: "1946 S IH-35, Austin, TX 78704",
          adminName: "Pat Admin",
          adminEmail: "admin@example.com",
          adminPhone: "555-987-6543",
        }),
      ),
    ).toEqual({
      organizationName: "Texas Dental Association",
      organizationAddress: "1946 S IH-35, Austin, TX 78704",
      adminName: "Pat Admin",
      adminEmail: "admin@example.com",
      adminPhone: "555-987-6543",
    });
  });
});
