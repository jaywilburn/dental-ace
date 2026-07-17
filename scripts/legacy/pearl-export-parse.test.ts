import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyRecords,
  derivePassed,
  guardedCompletionDate,
  parseCsv,
  parsePearlSheet,
  pearlCertNumber,
  pearlOccupationToLicenseType,
  PEARL_SHEETS,
  type ExistingCert,
  type PearlRecord,
} from "./pearl-export-parse";

// ---------------------------------------------------------------------------
// parseCsv
// ---------------------------------------------------------------------------

describe("parseCsv", () => {
  it("splits plain rows and fields", () => {
    expect(parseCsv("a,b,c\nd,e,f")).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
    ]);
  });
  it("honors quoted fields containing commas", () => {
    expect(parseCsv('x,"Pearl, Inc.",y')).toEqual([["x", "Pearl, Inc.", "y"]]);
  });
  it("honors quoted fields containing newlines (the Ending column)", () => {
    const rows = parseCsv('a,"line one\nline two",b\nc,d,e');
    expect(rows).toEqual([
      ["a", "line one\nline two", "b"],
      ["c", "d", "e"],
    ]);
  });
  it('unescapes "" inside quoted fields', () => {
    expect(parseCsv('"say ""hi""",x')).toEqual([['say "hi"', "x"]]);
  });
  it("handles CRLF line endings and a trailing newline", () => {
    expect(parseCsv("a,b\r\nc,d\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
  it("drops fully-empty rows and strips a BOM", () => {
    expect(parseCsv("\uFEFFa,b\n\n , \nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
  it("throws on an unterminated quote", () => {
    expect(() => parseCsv('a,"unclosed')).toThrow(/Unterminated/);
  });
});

// ---------------------------------------------------------------------------
// Pearl-specific occupation aliases (this export's vocabulary differs from the
// original migration source)
// ---------------------------------------------------------------------------

describe("pearlOccupationToLicenseType", () => {
  it("maps the Pearl-export dentist/hygienist variants", () => {
    expect(pearlOccupationToLicenseType("General Dentist")).toBe("DDS/DMD");
    expect(pearlOccupationToLicenseType("Hygienist")).toBe("RDH");
    expect(pearlOccupationToLicenseType(" hygienist ")).toBe("RDH");
  });
  it("passes through the shared normalize.ts vocabulary", () => {
    expect(pearlOccupationToLicenseType("Dental Assistant")).toBe("DA");
    expect(pearlOccupationToLicenseType("Pedodontist")).toBe("DDS/DMD");
    expect(pearlOccupationToLicenseType("Endodontist")).toBe("DDS/DMD");
  });
  it("keeps Dental Therapist and blanks unmapped, like the original migration", () => {
    expect(pearlOccupationToLicenseType("Dental Therapist")).toBeNull();
    expect(pearlOccupationToLicenseType("")).toBeNull();
    expect(pearlOccupationToLicenseType(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Completion-date guard
// ---------------------------------------------------------------------------

describe("guardedCompletionDate", () => {
  const submit = "2026-07-13";
  it("keeps a plausible attendee-entered course date", () => {
    expect(guardedCompletionDate("2026-07-09T00:00:00.000Z", submit)).toEqual({
      date: "2026-07-09",
      source: "course-date",
    });
  });
  it("accepts a course date equal to the submit date", () => {
    expect(guardedCompletionDate("2026-07-13T00:00:00.000Z", submit)).toEqual({
      date: "2026-07-13",
      source: "course-date",
    });
  });
  it("falls back on pre-2020 dates (1987-01-20 is in the real export)", () => {
    expect(guardedCompletionDate("1987-01-20T00:00:00.000Z", submit)).toEqual({
      date: submit,
      source: "submit-date",
    });
    expect(guardedCompletionDate("2016-07-08T00:00:00.000Z", submit)).toEqual({
      date: submit,
      source: "submit-date",
    });
  });
  it("falls back on future dates (after the submission)", () => {
    expect(guardedCompletionDate("2027-01-05T00:00:00.000Z", submit)).toEqual({
      date: submit,
      source: "submit-date",
    });
    expect(guardedCompletionDate("2026-07-14T00:00:00.000Z", submit)).toEqual({
      date: submit,
      source: "submit-date",
    });
  });
  it("falls back on impossible or blank dates", () => {
    expect(guardedCompletionDate("2026-13-40T00:00:00.000Z", submit).source).toBe("submit-date");
    expect(guardedCompletionDate("", submit).source).toBe("submit-date");
    expect(guardedCompletionDate(null, submit).source).toBe("submit-date");
  });
});

// ---------------------------------------------------------------------------
// passed derivation
// ---------------------------------------------------------------------------

describe("derivePassed", () => {
  it("recognizes the passing verdict", () => {
    expect(
      derivePassed("Congratulations, you received a passing score and will receive your certificate…"),
    ).toEqual({ passed: true, recognized: true });
  });
  it("recognizes the failing verdict", () => {
    expect(derivePassed("Unfortunately, you did not receive a passing score.")).toEqual({
      passed: false,
      recognized: true,
    });
  });
  it("treats an unknown verdict as a reported failure", () => {
    expect(derivePassed("Thanks for playing")).toEqual({ passed: false, recognized: false });
    expect(derivePassed("")).toEqual({ passed: false, recognized: false });
    expect(derivePassed(null)).toEqual({ passed: false, recognized: false });
  });
});

// ---------------------------------------------------------------------------
// Idempotency key
// ---------------------------------------------------------------------------

describe("pearlCertNumber", () => {
  it("is deterministic and shaped PEARL-<sheet>-<ts>-<hash8>", () => {
    const a = pearlCertNumber("DA255", "2026-07-13 20:51:12", "vicki@childrensdental.co");
    expect(a).toMatch(/^PEARL-DA255-20260713205112-[0-9a-f]{8}$/);
    expect(pearlCertNumber("DA255", "2026-07-13 20:51:12", "VICKI@childrensdental.co ")).toBe(a); // email case/space-insensitive
  });
  it("differs across sheet, timestamp, and email", () => {
    const base = pearlCertNumber("DA255", "2026-07-13 20:51:12", "a@b.co");
    expect(pearlCertNumber("DA253", "2026-07-13 20:51:12", "a@b.co")).not.toBe(base);
    expect(pearlCertNumber("DA255", "2026-07-13 20:51:13", "a@b.co")).not.toBe(base);
    expect(pearlCertNumber("DA255", "2026-07-13 20:51:12", "c@d.co")).not.toBe(base);
  });
});

// ---------------------------------------------------------------------------
// parsePearlSheet — synthetic sheet matching the real 33-column export layout
// ---------------------------------------------------------------------------

const QUIZ_DA255 = [
  "Radiographs automatically populate in Second Opinion after capturing.",
  "Second Opinion allows you to view images with AND without detections.",
  "Second Opinion can be used for:",
  "Which of the following is a core function of Practice Intelligence?",
  "What do Practice Intelligence schedule alerts help your team identify?",
];

const HEADER = [
  "First and Last name",
  "Best email to send certificate",
  "What day, month and year did you take the course?",
  "How many CE Hours was this Course?",
  "Please Select & Verify the Name of the Organization that Provided the Course",
  "Please Select & Verify the Name of the Course",
  "Please select the Course Subject Matter",
  "State of Licensure",
  "Are you licensed in more than one state?",
  "Additional State of Licensure",
  "Do you need to add another state where you are licensed?",
  "Additional State of Licensure",
  "Do you need to add another state where you are licensed?",
  "Additional State of Licensure",
  "Do you need to add another state where you are licensed?",
  "Additional State of Licensure",
  "Occupation",
  "What was the Course Format?",
  ...QUIZ_DA255,
  "counter_1d0fe6e8_ff0c_4fb1_9f94_5e2bd5831d07",
  "counter_b59fee77_e87a_4965_b92c_6ce8383e1c00",
  "Score",
  "Response Type",
  "Start Date (UTC)",
  "Stage Date (UTC)",
  "Submit Date (UTC)",
  "Network ID",
  "Tags",
  "Ending",
];

const PASS_ENDING =
  "Congratulations, you received a passing score and will receive your certificate via email.";

function csvField(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

type RowOverrides = Partial<Record<(typeof HEADER)[number] | "AdditionalStates", string | string[]>>;

function makeRow(overrides: RowOverrides = {}): string {
  const cells = HEADER.map(() => "");
  const set = (name: string, value: string, occurrence = 0) => {
    let seen = 0;
    for (let i = 0; i < HEADER.length; i += 1) {
      if (HEADER[i] === name) {
        if (seen === occurrence) {
          cells[i] = value;
          return;
        }
        seen += 1;
      }
    }
    throw new Error(`no header ${name}`);
  };
  set("First and Last name", "Vicki Howe");
  set("Best email to send certificate", "Vicki@ChildrensDental.co");
  set("What day, month and year did you take the course?", "2026-07-09T00:00:00.000Z");
  set("How many CE Hours was this Course?", "1");
  set("Please Select & Verify the Name of the Organization that Provided the Course", "Pearl, Inc.");
  set("Please Select & Verify the Name of the Course", "Practice Better with Practice Intelligence");
  set("Please select the Course Subject Matter", "Business/Practice Management");
  set("State of Licensure", "California");
  set("Occupation", "Dental Assistant");
  set("What was the Course Format?", "LIVE-Online (Zoom, Webinar, etc)");
  set(QUIZ_DA255[0], "True");
  set(QUIZ_DA255[1], "True");
  set(QUIZ_DA255[2], "All of the above");
  set(QUIZ_DA255[3], "Automating chart audits");
  set(QUIZ_DA255[4], "Opportunities");
  set("Score", "5");
  set("Response Type", "completed");
  set("Start Date (UTC)", "2026-07-13 20:48:44");
  set("Submit Date (UTC)", "2026-07-13 20:51:12");
  set("Network ID", "7a5b7c6cb0");
  set("Ending", PASS_ENDING);
  for (const [name, value] of Object.entries(overrides)) {
    if (name === "AdditionalStates") {
      (value as string[]).forEach((s, i) => set("Additional State of Licensure", s, i));
    } else {
      set(name, value as string);
    }
  }
  return cells.map(csvField).join(",");
}

function makeSheet(rows: string[]): string {
  return [HEADER.map(csvField).join(","), ...rows].join("\n");
}

describe("parsePearlSheet", () => {
  it("parses a passing row end-to-end", () => {
    const { records, skipped, quizQuestions } = parsePearlSheet(makeSheet([makeRow()]), "DA255");
    expect(skipped).toEqual([]);
    expect(quizQuestions).toEqual(QUIZ_DA255);
    expect(records).toHaveLength(1);
    const r = records[0];
    expect(r.attendeeName).toBe("Vicki Howe");
    expect(r.attendeeEmail).toBe("vicki@childrensdental.co"); // lowercased
    expect(r.licenseType).toBe("DA");
    expect(r.licenseStates).toEqual(["CA"]);
    expect(r.deliveryMethod).toBe("Live/Online");
    expect(r.courseType).toBe("Business/Practice Management");
    expect(r.score).toBe(5);
    expect(r.passed).toBe(true);
    expect(r.signalsDisagree).toBe(false);
    expect(r.completedAt).toBe("2026-07-09");
    expect(r.completedAtSource).toBe("course-date");
    expect(r.issuedAtIso).toBe("2026-07-13T20:51:12.000Z");
    expect(r.certNumber).toMatch(/^PEARL-DA255-20260713205112-[0-9a-f]{8}$/);
    expect(r.quizResponses).toEqual({
      [QUIZ_DA255[0]]: "True",
      [QUIZ_DA255[1]]: "True",
      [QUIZ_DA255[2]]: "All of the above",
      [QUIZ_DA255[3]]: "Automating chart audits",
      [QUIZ_DA255[4]]: "Opportunities",
    });
  });

  it("merges primary + additional states, dedupes, drops unmappable", () => {
    const sheet = makeSheet([
      makeRow({ "State of Licensure": "Ontario", AdditionalStates: ["Quebec", "Ontario", "Atlantis"] }),
    ]);
    const r = parsePearlSheet(sheet, "DA255").records[0];
    expect(r.licenseStates).toEqual(["ON", "QC"]);
    expect(r.droppedStates).toEqual(["Atlantis"]);
  });

  it("derives passed from the Ending text and flags score disagreements", () => {
    const sheet = makeSheet([
      makeRow({ Score: "3" }), // platform passed a 3/5 — agrees with PASS_THRESHOLD 3
      makeRow({
        Score: "2",
        "Submit Date (UTC)": "2026-06-16 15:32:51",
        Ending: "Unfortunately, you did not receive a passing score.",
      }),
      makeRow({ Score: "2", "Submit Date (UTC)": "2026-06-17 10:00:00" }), // congrats ending, score 2 -> disagree
    ]);
    const [pass3, fail2, weird] = parsePearlSheet(sheet, "DA255").records;
    expect(pass3.passed).toBe(true);
    expect(pass3.signalsDisagree).toBe(false);
    expect(fail2.passed).toBe(false);
    expect(fail2.signalsDisagree).toBe(false);
    expect(weird.passed).toBe(true); // Ending verdict wins
    expect(weird.signalsDisagree).toBe(true);
  });

  it("falls back to the submit date for implausible course dates", () => {
    const sheet = makeSheet([makeRow({ "What day, month and year did you take the course?": "1987-01-20T00:00:00.000Z" })]);
    const r = parsePearlSheet(sheet, "DA255").records[0];
    expect(r.completedAt).toBe("2026-07-13");
    expect(r.completedAtSource).toBe("submit-date");
  });

  it("skips rows with the wrong org/course/response type instead of importing them", () => {
    const sheet = makeSheet([
      makeRow({ "Please Select & Verify the Name of the Organization that Provided the Course": "Acme CE" }),
      makeRow({ "Please Select & Verify the Name of the Course": "Some Other Course" }),
      makeRow({ "Response Type": "partial" }),
      makeRow({ "Best email to send certificate": "not-an-email" }),
      makeRow(),
    ]);
    const { records, skipped } = parsePearlSheet(sheet, "DA255");
    expect(records).toHaveLength(1);
    expect(skipped).toHaveLength(4);
    expect(skipped.map((s) => s.rowNumber)).toEqual([1, 2, 3, 4]);
  });

  it("throws when a required column is missing", () => {
    const noEnding = makeSheet([makeRow()]).replace("Ending", "The End");
    expect(() => parsePearlSheet(noEnding, "DA255")).toThrow(/missing column "Ending"/);
  });
});

// ---------------------------------------------------------------------------
// classifyRecords
// ---------------------------------------------------------------------------

const COURSE_IDS: Record<string, string> = { DA255: "course-a", DA253: "course-b" };
const courseIdOf = (sheet: "DA255" | "DA253") => COURSE_IDS[sheet];

function record(overrides: Partial<PearlRecord>): PearlRecord {
  return {
    sheet: "DA255",
    rowNumber: 1,
    certNumber: "PEARL-DA255-20260713205112-00000000",
    networkId: "n1",
    attendeeName: "A B",
    attendeeEmail: "a@b.co",
    licenseType: "DA",
    occupationRaw: "Dental Assistant",
    licenseStates: ["CA"],
    droppedStates: [],
    deliveryMethod: "Live/Online",
    courseFormatRaw: "LIVE-Online (Zoom, Webinar, etc)",
    courseType: "Scientific",
    quizResponses: {},
    score: 5,
    passed: true,
    endingRecognized: true,
    signalsDisagree: false,
    completedAt: "2026-05-20",
    completedAtSource: "course-date",
    courseDateRaw: "2026-05-20T00:00:00.000Z",
    issuedAtIso: "2026-05-20T20:00:00.000Z",
    ...overrides,
  };
}

function existing(overrides: Partial<ExistingCert>): ExistingCert {
  return {
    legacyCertNumber: "LEGACY-DA255-00001",
    attendeeEmail: "a@b.co",
    completedAt: new Date("2026-05-20T12:00:00Z"),
    issuedAt: new Date("2026-05-20T20:00:00Z"),
    courseId: "course-a",
    ...overrides,
  };
}

describe("classifyRecords", () => {
  it("marks records already inserted by this importer via the PEARL- key", () => {
    const r = record({});
    const [c] = classifyRecords([r], [existing({ legacyCertNumber: r.certNumber })], courseIdOf);
    expect(c.classification).toBe("already-imported");
  });

  it("matches previously-migrated certs on (email, course, date)", () => {
    const [c] = classifyRecords([record({})], [existing({})], courseIdOf);
    expect(c.classification).toBe("duplicate-of-existing");
  });

  it("uses issuedAt's date when the existing cert has no completedAt", () => {
    const [c] = classifyRecords([record({})], [existing({ completedAt: null })], courseIdOf);
    expect(c.classification).toBe("duplicate-of-existing");
  });

  it("keeps genuinely new rows, including a different course or date", () => {
    const other = record({ sheet: "DA253", certNumber: "PEARL-DA253-20260520200000-00000001" });
    const later = record({ completedAt: "2026-06-01", certNumber: "PEARL-DA255-20260601200000-00000002" });
    const out = classifyRecords([other, later], [existing({})], courseIdOf);
    expect(out.map((c) => c.classification)).toEqual(["new", "new"]);
  });

  it("consumes multiset counts once per existing cert (same-day retakes both migrated)", () => {
    const r1 = record({ certNumber: "PEARL-DA255-20260520150000-00000001", issuedAtIso: "2026-05-20T15:00:00.000Z" });
    const r2 = record({ certNumber: "PEARL-DA255-20260520160000-00000002", issuedAtIso: "2026-05-20T16:00:00.000Z" });
    const r3 = record({ certNumber: "PEARL-DA255-20260520170000-00000003", issuedAtIso: "2026-05-20T17:00:00.000Z" });
    const out = classifyRecords([r1, r2, r3], [existing({}), existing({})], courseIdOf);
    expect(out.map((c) => c.classification)).toEqual([
      "duplicate-of-existing",
      "duplicate-of-existing",
      "new",
    ]);
  });

  it("lets passed rows claim existing certs before failed rows", () => {
    // A failed 10:00 attempt + a passing 10:30 retake, one migrated (passed)
    // cert on file: the pass must pair with the existing cert and the fail
    // must import as the new (hidden) row.
    const fail = record({
      certNumber: "PEARL-DA255-20260520100000-00000001",
      issuedAtIso: "2026-05-20T10:00:00.000Z",
      passed: false,
      score: 2,
    });
    const pass = record({
      certNumber: "PEARL-DA255-20260520103000-00000002",
      issuedAtIso: "2026-05-20T10:30:00.000Z",
    });
    const out = classifyRecords([fail, pass], [existing({})], courseIdOf);
    expect(out.find((c) => !c.passed)?.classification).toBe("new");
    expect(out.find((c) => c.passed)?.classification).toBe("duplicate-of-existing");
  });
});

// ---------------------------------------------------------------------------
// Real export CSVs: whole-file invariants the importer relies on. The files
// contain attendee PII and are kept out of the repo (local-only artifact,
// like the v3 source SQL), so this suite skips when they are absent.
// ---------------------------------------------------------------------------

const pearlCsvDir = path.join(process.cwd(), "scripts", "data", "legacy");
const pearlCsvsPresent = ["pearl-DA255.csv", "pearl-DA253.csv"].every((f) =>
  fs.existsSync(path.join(pearlCsvDir, f)),
);

describe.skipIf(!pearlCsvsPresent)("local Pearl export files", () => {
  it("parse to the expected row counts with unique cert numbers", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = join(process.cwd(), "scripts", "data", "legacy");
    const da255 = parsePearlSheet(readFileSync(join(dir, "pearl-DA255.csv"), "utf8"), "DA255");
    const da253 = parsePearlSheet(readFileSync(join(dir, "pearl-DA253.csv"), "utf8"), "DA253");
    expect(da255.records.length + da255.skipped.length).toBe(52);
    expect(da253.records.length + da253.skipped.length).toBe(114);
    expect(da255.skipped).toEqual([]);
    expect(da253.skipped).toEqual([]);
    const keys = [...da255.records, ...da253.records].map((r) => r.certNumber);
    expect(new Set(keys).size).toBe(keys.length); // (email, submit ts) unique per sheet
    // Every record normalized onto the canonical vocabularies or null.
    for (const r of [...da255.records, ...da253.records]) {
      expect(r.deliveryMethod).not.toBeNull();
      expect(r.courseType).not.toBeNull();
      expect(r.endingRecognized).toBe(true);
      expect(r.signalsDisagree).toBe(false); // Ending agrees with the 3/5 rule on every row
    }
    // The one known failing row (score 2, "Unfortunately" ending).
    expect(da255.records.filter((r) => !r.passed)).toHaveLength(1);
    expect(da253.records.filter((r) => !r.passed)).toHaveLength(0);
    expect(PEARL_SHEETS.DA255.courseLegacyId).toBe(1);
    expect(PEARL_SHEETS.DA253.courseLegacyId).toBe(2);
  });
});
