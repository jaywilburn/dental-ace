import { describe, it, expect } from "vitest";
import { deriveStages, firstFailingStep, stageOfField } from "@/lib/attend/event-stages";

const Q = "d1d1d1d1-0000-4000-8000-000000000001";

describe("deriveStages", () => {
  it("keeps the certificate flow unchanged without a survey, whatever needsCe says", () => {
    for (const needsCe of [null, true, false]) {
      expect(deriveStages({ selective: false, hasSurvey: false, needsCe })).toEqual([
        "identity",
        "affirm",
        "quiz",
        "review",
      ]);
      expect(deriveStages({ selective: true, hasSurvey: false, needsCe })).toEqual([
        "identity",
        "affirm",
        "select",
        "quiz",
        "review",
      ]);
    }
  });

  it("starts with the survey and the CE question, and stops there until it is answered", () => {
    expect(deriveStages({ selective: true, hasSurvey: true, needsCe: null })).toEqual(["survey", "needsCe"]);
  });

  it("continues to the certificate flow on Yes", () => {
    expect(deriveStages({ selective: false, hasSurvey: true, needsCe: true })).toEqual([
      "survey",
      "needsCe",
      "identity",
      "affirm",
      "quiz",
      "review",
    ]);
    expect(deriveStages({ selective: true, hasSurvey: true, needsCe: true })).toEqual([
      "survey",
      "needsCe",
      "identity",
      "affirm",
      "select",
      "quiz",
      "review",
    ]);
  });

  it("asks for contact details only on No", () => {
    expect(deriveStages({ selective: true, hasSurvey: true, needsCe: false })).toEqual([
      "survey",
      "needsCe",
      "contact",
    ]);
  });

  it("skips the CE question and goes straight to contact when certificates are unavailable", () => {
    for (const needsCe of [null, true, false]) {
      for (const selective of [true, false]) {
        expect(deriveStages({ selective, hasSurvey: true, needsCe, ceAvailable: false })).toEqual([
          "survey",
          "contact",
        ]);
      }
    }
  });

  it("keeps the certificate flow when certificates are unavailable but there is no survey (the page blocks)", () => {
    expect(deriveStages({ selective: false, hasSurvey: false, needsCe: null, ceAvailable: false })).toEqual([
      "identity",
      "affirm",
      "quiz",
      "review",
    ]);
  });

  it("keeps the survey and CE question at the same indices across answers", () => {
    for (const needsCe of [null, true, false]) {
      const steps = deriveStages({ selective: false, hasSurvey: true, needsCe });
      expect(steps.indexOf("survey")).toBe(0);
      expect(steps.indexOf("needsCe")).toBe(1);
    }
  });
});

describe("stageOfField", () => {
  it("routes survey errors to the survey", () => {
    expect(stageOfField("survey", true)).toBe("survey");
    expect(stageOfField(`survey.${Q}`, false)).toBe("survey");
  });
  it("routes name and email to the contact step only on the No-CE path", () => {
    expect(stageOfField("attendeeEmail", false)).toBe("contact");
    expect(stageOfField("attendeeEmail", true)).toBe("identity");
    expect(stageOfField("attendeeName", null)).toBe("identity");
    expect(stageOfField("licenseStates", false)).toBe("identity");
  });
  it("leaves unknown fields unmapped", () => {
    expect(stageOfField("token", true)).toBeUndefined();
  });
});

describe("firstFailingStep", () => {
  it("sends server survey errors back to the first stage on a survey-first event", () => {
    const steps = deriveStages({ selective: false, hasSurvey: true, needsCe: true });
    expect(firstFailingStep(steps, { [`survey.${Q}`]: ["x"], answers: ["y"] }, true)).toBe(0);
  });
  it("picks the earliest failing stage of this flow", () => {
    const steps = deriveStages({ selective: false, hasSurvey: false, needsCe: null });
    expect(firstFailingStep(steps, { answers: ["x"], licenseStates: ["y"] }, null)).toBe(0);
    expect(firstFailingStep(steps, { answers: ["x"] }, null)).toBe(2);
  });
  it("keeps No-CE name and email errors on the contact step", () => {
    const steps = deriveStages({ selective: false, hasSurvey: true, needsCe: false });
    expect(firstFailingStep(steps, { attendeeEmail: ["x"] }, false)).toBe(2);
  });
  it("keeps name and email errors on the contact step when certificates are unavailable", () => {
    const steps = deriveStages({ selective: true, hasSurvey: true, needsCe: false, ceAvailable: false });
    expect(firstFailingStep(steps, { attendeeName: ["x"] }, false)).toBe(1);
    expect(firstFailingStep(steps, { [`survey.${Q}`]: ["x"], attendeeEmail: ["y"] }, false)).toBe(0);
  });
  it("returns null when no error maps to a stage here", () => {
    const steps = deriveStages({ selective: false, hasSurvey: false, needsCe: null });
    expect(firstFailingStep(steps, { token: ["x"], selectedSessionIds: ["y"] }, null)).toBeNull();
  });
});
