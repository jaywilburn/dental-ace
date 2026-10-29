import { describe, it, expect } from "vitest";
import {
  courseIdNumberSchema,
  draftLabel,
  parseDraftValues,
  expiryIsoFor,
  parseAddCourseForm,
  parseCourseDetailsForm,
  todayIso,
} from "@/lib/admin/course-add-rules";
import { DA236_FIELDS, formData } from "@/lib/admin/course-add.fixture";

const TODAY = "2026-10-29";

function validForm(overrides: Record<string, string> = {}): FormData {
  return formData({ ...DA236_FIELDS, ...overrides });
}

describe("parseAddCourseForm", () => {
  it("accepts DA236 and derives the 3-year expiry", () => {
    const r = parseAddCourseForm(validForm(), TODAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({
      courseIdNumber: "ACE-LEG-00124",
      courseTitle: "COLLABricon Ultimate Team Synergy Summit",
      legacyCourseId: "DA236",
      ceHours: 6,
      courseType: "Business/Practice Management",
      deliveryMethod: "LIVE In Person",
      approvedOn: "2025-10-14",
      expiresOn: "2028-10-14",
    });
    expect(r.data.quiz).toHaveLength(5);
    expect(r.data.quiz[0]).toEqual({
      type: "TF",
      question: "Collaboration within dental teams increases treatment acceptance and patient satisfaction.",
      correctAnswer: "True",
    });
    expect(r.data.quiz[2]).toMatchObject({ type: "MC", correctIndex: 1 });
  });

  it("trims and collapses whitespace in the course ID, title and legacy number", () => {
    const r = parseAddCourseForm(
      validForm({ courseIdNumber: "  DA  236 ", courseTitle: " Team   Synergy ", legacyCourseId: "  " }),
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.courseIdNumber).toBe("DA 236");
    expect(r.data.courseTitle).toBe("Team Synergy");
    expect(r.data.legacyCourseId).toBeNull();
  });

  it("accepts fractional hours up to two decimals", () => {
    const r = parseAddCourseForm(validForm({ ceHours: "4.75" }), TODAY);
    expect(r.ok && r.data.ceHours).toBe(4.75);
    expect(parseAddCourseForm(validForm({ ceHours: "4.755" }), TODAY).ok).toBe(false);
  });

  it("puts each problem on its own field and echoes what was typed", () => {
    const r = parseAddCourseForm(
      validForm({ courseIdNumber: "", ceHours: "", courseType: "Other", q4_option_2: "" }),
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(["ceHours", "courseIdNumber", "courseType", "q4_option_2"]);
    expect(r.errors.ceHours).toEqual(["Enter the CE hours."]);
    expect(r.values.courseTitle).toBe("COLLABricon Ultimate Team Synergy Summit");
    expect(r.values.quiz[4]).toMatchObject({ question: "Which phrase best captures the goal of COLLABricon?" });
  });

  it("refuses an approval date in the future", () => {
    const r = parseAddCourseForm(validForm({ approvedOn: "2026-10-30" }), TODAY);
    expect(!r.ok && r.errors.approvedOn).toEqual(["The approval date can't be in the future."]);
  });

  it("accepts today and refuses a date whose 3-year accreditation has lapsed", () => {
    expect(parseAddCourseForm(validForm({ approvedOn: TODAY }), TODAY).ok).toBe(true);
    // Expires exactly today: already over.
    const lapsed = parseAddCourseForm(validForm({ approvedOn: "2023-10-29" }), TODAY);
    expect(!lapsed.ok && lapsed.errors.approvedOn?.[0]).toMatch(/already expired/);
    expect(parseAddCourseForm(validForm({ approvedOn: "2023-10-30" }), TODAY).ok).toBe(true);
  });

  it("refuses a malformed or impossible date with one message", () => {
    for (const approvedOn of ["", "10/14/2025", "2025-02-30"]) {
      const r = parseAddCourseForm(validForm({ approvedOn }), TODAY);
      expect(!r.ok && r.errors.approvedOn).toEqual(["Enter the approval date."]);
    }
  });
});

describe("courseIdNumberSchema", () => {
  it("accepts any client's numbering", () => {
    for (const id of ["ACE-LEG-00124", "DA236", "PPL/2026.04", "Course #12", "ACE-2026"]) {
      expect(courseIdNumberSchema.safeParse(id).success, id).toBe(true);
    }
  });

  it("reserves the ACE-YYYY- prefix the review queue numbers from, in any case", () => {
    for (const id of ["ACE-2026-00050", "ACE-2026-9", "ace-2024-abc"]) {
      expect(courseIdNumberSchema.safeParse(id).success, id).toBe(false);
    }
  });

  it("refuses markup characters and a leading separator", () => {
    for (const id of ["<b>DA236</b>", '"DA236"', "-DA236", "x"]) {
      expect(courseIdNumberSchema.safeParse(id).success, id).toBe(false);
    }
  });
});

describe("dates", () => {
  it("expiry is 3 years later; Feb 29 rolls to Mar 1", () => {
    expect(expiryIsoFor("2025-10-14")).toBe("2028-10-14");
    expect(expiryIsoFor("2024-02-29")).toBe("2027-03-01");
  });

  it("today is the US Central calendar date, not UTC", () => {
    // 02:00 UTC on Oct 30 is still the evening of Oct 29 in Chicago.
    expect(todayIso(new Date("2026-10-30T02:00:00Z"))).toBe("2026-10-29");
    expect(todayIso(new Date("2026-10-30T06:00:00Z"))).toBe("2026-10-30");
  });
});

describe("parseCourseDetailsForm", () => {
  function details(overrides: Record<string, string> = {}): FormData {
    const fd = new FormData();
    const fields = {
      ceHours: "5",
      courseType: "Scientific",
      deliveryMethod: "LIVE Online",
      approvedOn: "2023-06-01",
      ...overrides,
    };
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  }

  it("lets an expired course's hours be fixed when the approval date is unchanged", () => {
    const r = parseCourseDetailsForm(details(), TODAY, "2023-06-01");
    expect(r).toEqual({
      ok: true,
      data: {
        ceHours: 5,
        courseType: "Scientific",
        deliveryMethod: "LIVE Online",
        approvedOn: "2023-06-01",
        expiresOn: "2026-06-01",
      },
    });
  });

  it("applies the expiry rule once the approval date changes", () => {
    const r = parseCourseDetailsForm(details({ approvedOn: "2023-07-01" }), TODAY, "2023-06-01");
    expect(r.ok).toBe(false);
    expect(parseCourseDetailsForm(details({ approvedOn: "2024-07-01" }), TODAY, "2023-06-01").ok).toBe(true);
  });

  it("reports the first problem as a single message", () => {
    expect(parseCourseDetailsForm(details({ ceHours: "0" }), TODAY, "2023-06-01")).toEqual({
      ok: false,
      error: "Enter at least 0.5 CE hours.",
    });
  });
});

describe("draft values", () => {
  it("reads back what was stored and blanks anything malformed", () => {
    const quiz = [{ type: "TF", question: "Q1", correctAnswer: "False" }];
    expect(parseDraftValues({ courseTitle: "Synergy", ceHours: "6", quiz })).toMatchObject({
      courseTitle: "Synergy",
      ceHours: "6",
      courseIdNumber: "",
      quiz,
    });
    expect(parseDraftValues({ courseTitle: 42, quiz: "nope" })).toMatchObject({ courseTitle: "", quiz: [] });
    expect(parseDraftValues(null).courseTitle).toBe("");
  });

  it("names a draft by title, then course ID", () => {
    expect(draftLabel({ courseTitle: "Synergy", courseIdNumber: "DA236" })).toBe("Synergy");
    expect(draftLabel({ courseTitle: "", courseIdNumber: "DA236" })).toBe("DA236");
    expect(draftLabel({ courseTitle: "", courseIdNumber: "" })).toBe("Untitled draft");
  });
});
