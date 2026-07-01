import PDFDocument from "pdfkit";

/*
  Code-generated Course Application Worksheet (public/application-overview.pdf).

  This replaces a flattened, source-less PDF export that the client flagged as
  "looks unformatted" and that still carried two stale "attach CV / Resume /
  upload file" lines. Those fields are now typed-text on the live form, so the
  worksheet is rebuilt here from the SAME question list the online wizard asks
  (app/company/applications/new/*), with the site's own labels and hints.

  Layout intent (the client's formatting fix):
    - Section HEADERS sit flush with the left margin.
    - Each question is a gold bullet at the left margin; the question label and
      its descriptive/hint text are INDENTED to a single text column with a
      fixed width, so wrapped lines stay indented instead of falling back to
      the far-left margin.

  No "server-only" import: this is a plain build-script renderer (run via
  `pnpm build:worksheet`) and uses only PDFKit's built-in fonts, so it needs no
  external assets. Returns a Buffer ready to write to disk.
*/

export type WorksheetField = {
  label: string;
  hint?: string;
  /** Choice options rendered as a checklist under the question. */
  options?: readonly string[];
  /** Appends "(optional)" to the label for non-required fields. */
  optional?: boolean;
  /**
   * Blank answer rules to draw under the question. Defaults to 1 for write-in
   * fields and 0 for choice-only fields. Quiz items set both options and lines
   * (a line for the question text plus the answer choices).
   */
  lines?: number;
};

export type WorksheetSection = {
  title: string;
  description?: string;
  fields: WorksheetField[];
};

const DELIVERY_FORMAT_OPTIONS = [
  "Live/In Person",
  "Live/Online",
  "On Demand Video",
  "On Demand Audio",
  "Printed Course",
] as const;

// Mirrors the live wizard step-for-step. Labels and hints are taken from the
// online form so the worksheet reads exactly like the screen the applicant
// will fill in. No upload fields: everything is typed or pasted.
export const WORKSHEET_SECTIONS: readonly WorksheetSection[] = [
  {
    title: "Organization & Contact",
    description:
      "Tell us who is submitting the course and who should receive every communication and the billing.",
    fields: [
      { label: "Name of Organization / Company / Association / Individual" },
      { label: "Organization Full Address", hint: "City, State, Zip" },
      {
        label: "Process Administrator Full Name",
        hint: "Responsible for all interactions, communications, and billing.",
      },
      { label: "Process Administrator Email" },
      { label: "Process Administrator Phone" },
    ],
  },
  {
    title: "Course Information",
    description:
      "Describe the course itself. Every answer here is typed or pasted into the online form; nothing needs to be sent as a file.",
    fields: [
      { label: "Course Title" },
      {
        label: "CE Credit Hours",
        hint: "Exact hours, for example 1.5. Submit a separate application for each version of a course.",
      },
      {
        label: "Course Subject Matter",
        options: ["Scientific (Clinical)", "Business/Practice Management"],
      },
      {
        label: "Course Format",
        hint: "Each format requires the 5-question quiz in the Quiz section below.",
        options: DELIVERY_FORMAT_OPTIONS,
      },
      {
        label: "Format you will use MOST to distribute this course",
        hint: "Just your primary format. This does not limit you; once approved you can deliver the course in any format you were accredited for.",
        options: DELIVERY_FORMAT_OPTIONS,
      },
      {
        label: "Public Protection Statement",
        hint: "How does this course better enable participants to protect the public?",
        lines: 2,
      },
      {
        label: "Course Short Description",
        hint: "Quick summary, no more than 2 concise paragraphs.",
        lines: 2,
      },
      {
        label: "Course Objectives",
        hint: "Minimum 3, list each on a new line.",
        lines: 3,
      },
      {
        label: "Course Outline",
        hint: "Paste or type the full outline, including section timings.",
        lines: 4,
      },
    ],
  },
  {
    title: "Course Creator",
    description: "The person who developed or designed the course.",
    fields: [
      { label: "Creator Name" },
      { label: "Credentials", hint: "For example: DDS, FAGD (University, Year)" },
      { label: "Current Position" },
      { label: "Course Creator Email" },
      { label: "Course Creator Phone" },
      { label: "Course Creator Address", hint: "City, State, Zip" },
      {
        label: "Highest Earned Educational Degree",
        options: ["Associates", "Bachelors", "Masters", "Doctoral", "None of the Above"],
      },
      {
        label: "Education Part 1",
        hint: "Universities/colleges attended, degree(s) and graduation date(s).",
      },
      {
        label: "Education Part 2",
        hint: "Other training relevant to mentoring this course.",
        optional: true,
      },
      {
        label: "Education Part 3",
        hint: "Technical degree(s), college(s) attended, date(s) of graduation.",
        optional: true,
      },
      {
        label: "Education Part 4",
        hint: "Other applicable info. If none, type N/A.",
      },
      {
        label: "Experience Relative to Course Subject Matter",
        hint: "For example: research department working on dental materials for 6 years.",
        lines: 2,
      },
      {
        // Replaces the retired "attach CV, Resume and/or Detailed Bio Upload
        // file" line. The bio is now typed/pasted rich text on the live form.
        label: "Detailed Bio",
        hint: "Type or paste the creator's full bio: education, credentials, clinical experience, and teaching history. The online form provides a formatting toolbar.",
        lines: 4,
      },
    ],
  },
  {
    title: "Presenter(s)",
    description:
      "Provide details for each presenter. The online form ships with one primary presenter and supports up to eight.",
    fields: [
      { label: "Presenter Name" },
      { label: "Role", options: ["Primary Presenter", "Co-Presenter", "Moderator"] },
      {
        label: "Commercial Disclosure",
        hint: "List any relevant financial relationships, or state that there are none.",
      },
      {
        label: "Experience Relative to Course Matter",
        hint: "Last Name, First Name, experience relative to course matter.",
      },
      {
        label: "Training Received by Presenter",
        hint: "How much time, and a description: live, paper, or digital?",
      },
      {
        label: "Presenter Bio",
        hint: "Include the presenter's name and title.",
        lines: 2,
      },
    ],
  },
  {
    title: "Quiz Questions",
    description:
      "Five questions are required. Questions 1 and 2 are True/False; questions 3, 4, and 5 are 4-answer multiple choice with exactly one correct answer. Passing is 3 of 5 correct, with 1 retake allowed.",
    fields: [
      {
        label: "Quiz Question 1 (True/False)",
        hint: "Write the question, then mark the correct answer.",
        options: ["True", "False"],
        lines: 1,
      },
      {
        label: "Quiz Question 2 (True/False)",
        hint: "Write the question, then mark the correct answer.",
        options: ["True", "False"],
        lines: 1,
      },
      {
        label: "Quiz Question 3 (Multiple Choice)",
        hint: "Write the question and four answer options, then mark the one correct answer.",
        options: ["Option A", "Option B", "Option C", "Option D"],
        lines: 1,
      },
      {
        label: "Quiz Question 4 (Multiple Choice)",
        hint: "Write the question and four answer options, then mark the one correct answer.",
        options: ["Option A", "Option B", "Option C", "Option D"],
        lines: 1,
      },
      {
        label: "Quiz Question 5 (Multiple Choice)",
        hint: "Write the question and four answer options, then mark the one correct answer.",
        options: ["Option A", "Option B", "Option C", "Option D"],
        lines: 1,
      },
    ],
  },
];

/**
 * Every piece of copy that the worksheet renders, joined into one string.
 * Used by tests to assert the rendered content carries no upload language
 * (PDFKit compresses content streams, so the buffer itself is not greppable).
 */
export function worksheetPlainText(): string {
  const parts: string[] = [];
  for (const section of WORKSHEET_SECTIONS) {
    parts.push(section.title);
    if (section.description) parts.push(section.description);
    for (const field of section.fields) {
      parts.push(field.label);
      if (field.hint) parts.push(field.hint);
      if (field.options) parts.push(...field.options);
    }
  }
  return parts.join("\n");
}

const NAVY = "#0B1A2E";
const GOLD = "#C8971A";
const GOLD_LIGHT = "#E4C060";
const TEXT_MID = "#344E6E";
const TEXT_MUTED = "#6B87A8";
const RULE_LIGHT = "#C7D2DE";
const DIVIDER = "#DCE3EC";

const LEFT = 56;
const RIGHT_MARGIN = 56;
const TEXT_X = 74; // question label + hint indent
const OPT_TEXT_X = 92; // option label indent
const OPT_MARK_X = 78; // option checkbox indent
const SUBSEQUENT_TOP = 64; // content top on auto-added pages (below slim header)

export async function renderApplicationWorksheetPdf(): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "LETTER",
        margins: { top: SUBSEQUENT_TOP, bottom: 64, left: LEFT, right: RIGHT_MARGIN },
        bufferPages: true,
      });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const PAGE_W = doc.page.width;
      const FULL_WIDTH = PAGE_W - LEFT - RIGHT_MARGIN; // 500 on LETTER
      const TEXT_WIDTH = PAGE_W - TEXT_X - RIGHT_MARGIN; // 482
      const OPT_WIDTH = PAGE_W - OPT_TEXT_X - RIGHT_MARGIN;
      const CONTENT_BOTTOM = doc.page.height - 92; // leave room above the footer
      const FOOTER_Y = doc.page.height - 74;

      // Mutable cursor. All drawing uses explicit coordinates; doc.y is never
      // relied on across blocks, so manual pagination stays predictable.
      const cursor = { y: 0 };

      // Slim repeating header for every page after the first. Registered before
      // any addPage() so auto-added (overflow) pages get it; the constructor's
      // first page predates this listener and gets the full masthead instead.
      doc.on("pageAdded", () => {
        doc.rect(0, 0, PAGE_W, 46).fill(NAVY);
        doc
          .fillColor("#FFFFFF")
          .font("Times-Bold")
          .fontSize(15)
          .text("Dental", LEFT, 15, { continued: true, lineBreak: false })
          .fillColor(GOLD_LIGHT)
          .text("ACE");
        doc
          .fillColor("#FFFFFF", 0.55)
          .font("Helvetica")
          .fontSize(9)
          .text("Course Application Worksheet", LEFT, 18, {
            width: FULL_WIDTH,
            align: "right",
            lineBreak: false,
          })
          .fillOpacity(1);
        cursor.y = SUBSEQUENT_TOP;
      });

      // ---- Page 1 masthead --------------------------------------------------
      doc.rect(0, 0, PAGE_W, 96).fill(NAVY);
      doc
        .fillColor("#FFFFFF")
        .font("Times-Bold")
        .fontSize(28)
        .text("Dental", LEFT, 32, { continued: true, lineBreak: false })
        .fillColor(GOLD_LIGHT)
        .text("ACE");
      doc
        .fillColor("#FFFFFF", 0.55)
        .font("Helvetica")
        .fontSize(10)
        .text("AADB Accredited Continuing Education Program", LEFT, 66, {
          lineBreak: false,
        })
        .fillOpacity(1);

      // Gold accent rule + title
      doc
        .moveTo(LEFT, 116)
        .lineTo(LEFT + 40, 116)
        .lineWidth(3)
        .strokeColor(GOLD)
        .stroke();
      doc
        .fillColor(NAVY)
        .font("Times-Bold")
        .fontSize(21)
        .text("Course Application Worksheet", LEFT, 128, { lineBreak: false });

      doc
        .font("Helvetica")
        .fontSize(10.5)
        .fillColor(TEXT_MID)
        .text(
          "Use this worksheet to gather everything you need before you start your DentalACE course application online. Every field below mirrors the online form, and each answer is typed or pasted directly into it. There are no files to prepare.",
          LEFT,
          158,
          { width: FULL_WIDTH, lineGap: 2.5 },
        );
      cursor.y = doc.y + 14;

      // ---- Helpers ----------------------------------------------------------
      function ensureSpace(needed: number): void {
        if (cursor.y + needed > CONTENT_BOTTOM) {
          doc.addPage(); // pageAdded resets cursor.y to SUBSEQUENT_TOP
        }
      }

      function drawSectionHeader(section: WorksheetSection): void {
        // Keep the header with at least the first line of its description.
        ensureSpace(70);
        cursor.y += 10;
        doc
          .moveTo(LEFT, cursor.y)
          .lineTo(LEFT + 34, cursor.y)
          .lineWidth(2.5)
          .strokeColor(GOLD)
          .stroke();
        cursor.y += 9;
        doc
          .font("Times-Bold")
          .fontSize(15)
          .fillColor(NAVY)
          .text(section.title, LEFT, cursor.y, { width: FULL_WIDTH });
        cursor.y = doc.y;
        if (section.description) {
          cursor.y += 3;
          doc
            .font("Helvetica")
            .fontSize(9.5)
            .fillColor(TEXT_MUTED)
            .text(section.description, LEFT, cursor.y, {
              width: FULL_WIDTH,
              lineGap: 1.5,
            });
          cursor.y = doc.y;
        }
        cursor.y += 8;
        doc
          .moveTo(LEFT, cursor.y)
          .lineTo(LEFT + FULL_WIDTH, cursor.y)
          .lineWidth(0.5)
          .strokeColor(DIVIDER)
          .stroke();
        cursor.y += 12;
      }

      function drawField(field: WorksheetField): void {
        const labelText = field.optional ? `${field.label} (optional)` : field.label;
        const lineCount = field.lines ?? (field.options ? 0 : 1);

        // Measure so the whole question block stays on one page.
        doc.font("Helvetica-Bold").fontSize(10.5);
        let needed = doc.heightOfString(labelText, { width: TEXT_WIDTH }) + 4;
        if (field.hint) {
          doc.font("Helvetica").fontSize(9);
          needed += doc.heightOfString(field.hint, { width: TEXT_WIDTH, lineGap: 1 }) + 3;
        }
        needed += lineCount * 18;
        if (field.options) needed += field.options.length * 15 + 4;
        needed += 12;
        ensureSpace(needed);

        const top = cursor.y;
        // Gold bullet at the left margin.
        doc
          .font("Helvetica-Bold")
          .fontSize(11)
          .fillColor(GOLD)
          .text("•", LEFT, top, { width: 12, lineBreak: false });
        // Question label, indented into the single text column.
        doc
          .font("Helvetica-Bold")
          .fontSize(10.5)
          .fillColor(NAVY)
          .text(labelText, TEXT_X, top, { width: TEXT_WIDTH });
        cursor.y = doc.y;

        if (field.hint) {
          cursor.y += 2;
          doc
            .font("Helvetica")
            .fontSize(9)
            .fillColor(TEXT_MUTED)
            .text(field.hint, TEXT_X, cursor.y, { width: TEXT_WIDTH, lineGap: 1 });
          cursor.y = doc.y;
        }

        // Blank answer rules (write-in space), indented under the question.
        if (lineCount > 0) {
          cursor.y += 14;
          for (let i = 0; i < lineCount; i++) {
            doc
              .moveTo(TEXT_X, cursor.y)
              .lineTo(TEXT_X + TEXT_WIDTH, cursor.y)
              .lineWidth(0.5)
              .strokeColor(RULE_LIGHT)
              .stroke();
            cursor.y += 18;
          }
          cursor.y -= 4;
        }

        // Choice checklist, indented under the question.
        if (field.options) {
          cursor.y += 6;
          for (const opt of field.options) {
            const optTop = cursor.y;
            doc
              .rect(OPT_MARK_X, optTop + 1, 8, 8)
              .lineWidth(0.8)
              .strokeColor(TEXT_MUTED)
              .stroke();
            doc
              .font("Helvetica")
              .fontSize(9.5)
              .fillColor(TEXT_MID)
              .text(opt, OPT_TEXT_X, optTop, { width: OPT_WIDTH });
            cursor.y = doc.y + 4;
          }
        }

        cursor.y += 12;
      }

      // ---- Body -------------------------------------------------------------
      for (const section of WORKSHEET_SECTIONS) {
        drawSectionHeader(section);
        for (const field of section.fields) {
          drawField(field);
        }
      }

      // ---- Footer on every page (drawn after layout via buffered pages) -----
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        doc
          .moveTo(LEFT, FOOTER_Y - 8)
          .lineTo(LEFT + FULL_WIDTH, FOOTER_Y - 8)
          .lineWidth(0.5)
          .strokeColor(DIVIDER)
          .stroke();
        doc
          .font("Helvetica")
          .fontSize(8.5)
          .fillColor(TEXT_MUTED)
          .text("DentalACE · AADB Continuing Education Program", LEFT, FOOTER_Y, {
            width: FULL_WIDTH,
            align: "left",
            lineBreak: false,
          })
          .text(`Page ${i + 1} of ${range.count}`, LEFT, FOOTER_Y, {
            width: FULL_WIDTH,
            align: "right",
            lineBreak: false,
          });
      }
      doc.flushPages();

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
