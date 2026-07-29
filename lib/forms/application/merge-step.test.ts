import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

/*
  The shared step-merge core. On success it merges the PARSED slice; on failure
  it persists the RAW slice and redirects, so the step page re-renders exactly
  what the provider typed. Before 2026-07-29 the failure path redirected without
  writing anything, so the page re-rendered from an empty draft and erased the
  whole screen.
*/

const { prismaMock, redirectMock } = vi.hoisted(() => ({
  prismaMock: {
    courseApplication: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  redirectMock: vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("server-only", () => ({}));

import { mergeApplicationStep } from "@/lib/forms/application/merge-step";

const schema = z.object({
  courseTitle: z.string().min(3, "Course title is required"),
  courseObjectives: z.string().min(5),
});

const ROUTE = "/company/applications/new/course";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.courseApplication.findFirst.mockResolvedValue({
    applicationData: { organizationName: "Texas Dental Association" },
  });
});

describe("mergeApplicationStep on success", () => {
  it("merges the parsed slice into the existing draft data", async () => {
    const parsed = await mergeApplicationStep(
      "app-1",
      "company-1",
      schema,
      { courseTitle: "Implant Basics", courseObjectives: "Learn things" },
      ROUTE,
    );

    expect(parsed).toEqual({
      courseTitle: "Implant Basics",
      courseObjectives: "Learn things",
    });
    expect(prismaMock.courseApplication.update).toHaveBeenCalledWith({
      where: { id: "app-1" },
      data: {
        applicationData: {
          organizationName: "Texas Dental Association",
          courseTitle: "Implant Basics",
          courseObjectives: "Learn things",
        },
      },
    });
    expect(prismaMock.courseApplication.updateMany).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("refuses to touch a draft that is not the caller's own DRAFT", async () => {
    prismaMock.courseApplication.findFirst.mockResolvedValue(null);
    await expect(
      mergeApplicationStep("app-1", "other-company", schema, {}, ROUTE),
    ).rejects.toThrow("Draft not found");
    expect(prismaMock.courseApplication.update).not.toHaveBeenCalled();
    expect(prismaMock.courseApplication.updateMany).not.toHaveBeenCalled();
  });
});

describe("mergeApplicationStep on failure (the echo)", () => {
  it("persists the raw slice and redirects with error=validation", async () => {
    await expect(
      mergeApplicationStep(
        "app-1",
        "company-1",
        schema,
        { courseTitle: "x", courseObjectives: "A long objectives block" },
        ROUTE,
      ),
    ).rejects.toThrow(`NEXT_REDIRECT:${ROUTE}?error=validation`);

    expect(prismaMock.courseApplication.updateMany).toHaveBeenCalledTimes(1);
    const [arg] = prismaMock.courseApplication.updateMany.mock.calls[0] as [
      { where: Record<string, unknown>; data: { applicationData: Record<string, unknown> } },
    ];
    // The valid field survives alongside the invalid one, and the pre-existing
    // draft data is preserved.
    expect(arg.data.applicationData).toEqual({
      organizationName: "Texas Dental Association",
      courseTitle: "x",
      courseObjectives: "A long objectives block",
    });
  });

  it("scopes the echo write to the owning company's DRAFT (no TOCTOU window)", async () => {
    await expect(
      mergeApplicationStep("app-1", "company-1", schema, { courseTitle: "x" }, ROUTE),
    ).rejects.toThrow(/NEXT_REDIRECT/);

    const [arg] = prismaMock.courseApplication.updateMany.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(arg.where).toEqual({ id: "app-1", companyId: "company-1", status: "DRAFT" });
  });

  it("never writes the parsed-path update on failure", async () => {
    await expect(
      mergeApplicationStep("app-1", "company-1", schema, { courseTitle: "x" }, ROUTE),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(prismaMock.courseApplication.update).not.toHaveBeenCalled();
  });

  it("signals too_long rather than truncating an oversized paste silently", async () => {
    await expect(
      mergeApplicationStep(
        "app-1",
        "company-1",
        schema,
        { courseTitle: "x", courseObjectives: "y".repeat(400_000) },
        ROUTE,
      ),
    ).rejects.toThrow(`NEXT_REDIRECT:${ROUTE}?error=too_long`);

    const [arg] = prismaMock.courseApplication.updateMany.mock.calls[0] as [
      { data: { applicationData: { courseObjectives: string } } },
    ];
    expect(arg.data.applicationData.courseObjectives.length).toBe(25_000);
  });

  it("drops NaN instead of writing SQL null under a number field", async () => {
    const numeric = z.object({ ceCreditHours: z.number().min(0.5) });
    await expect(
      mergeApplicationStep(
        "app-1",
        "company-1",
        numeric,
        { ceCreditHours: Number.NaN },
        ROUTE,
      ),
    ).rejects.toThrow(/NEXT_REDIRECT/);

    const [arg] = prismaMock.courseApplication.updateMany.mock.calls[0] as [
      { data: { applicationData: Record<string, unknown> } },
    ];
    expect("ceCreditHours" in arg.data.applicationData).toBe(false);
  });
});
