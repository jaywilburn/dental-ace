import { describe, it, expect } from "vitest";
import {
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
