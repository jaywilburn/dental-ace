import { describe, it, expect } from "vitest";
import {
  ATTACHMENT_FIELDS,
  validateUpload,
  sanitizeFilename,
  buildAttachmentPath,
  uploadMetaSchema,
} from "@/lib/forms/application/upload-schema";

describe("ATTACHMENT_FIELDS", () => {
  it("only allows the presenter headshot (outline + CV became text fields)", () => {
    expect(ATTACHMENT_FIELDS).toEqual(["headshot"]);
  });
});

describe("validateUpload", () => {
  it("accepts a PNG or JPEG headshot within the size limit", () => {
    expect(validateUpload("headshot", { type: "image/png", size: 1024 })).toBeNull();
    expect(validateUpload("headshot", { type: "image/jpeg", size: 1024 })).toBeNull();
  });

  it("rejects a PDF headshot", () => {
    expect(
      validateUpload("headshot", { type: "application/pdf", size: 1024 }),
    ).toMatch(/unsupported/i);
  });

  it("rejects a headshot over 5 MB", () => {
    expect(
      validateUpload("headshot", { type: "image/png", size: 6 * 1024 * 1024 }),
    ).toMatch(/too large/i);
  });

  it("rejects an empty file", () => {
    expect(validateUpload("headshot", { type: "image/png", size: 0 })).toMatch(
      /empty/i,
    );
  });
});

describe("sanitizeFilename", () => {
  it("strips path components", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\Users\\x\\outline.pdf")).toBe("outline.pdf");
  });

  it("replaces unsafe characters", () => {
    expect(sanitizeFilename("my course outline (v2).pdf")).toBe(
      "my_course_outline_v2_.pdf",
    );
  });

  it("falls back to a default for empty results", () => {
    expect(sanitizeFilename("///")).toBe("file");
  });
});

describe("buildAttachmentPath", () => {
  it("builds a sanitized, namespaced path", () => {
    expect(buildAttachmentPath("app-123", "headshot", "../evil.png", 1700000000000)).toBe(
      "applications/app-123/headshot/1700000000000-evil.png",
    );
  });
});

describe("uploadMetaSchema", () => {
  it("rejects an unknown field", () => {
    expect(uploadMetaSchema.safeParse({ applicationId: "x", field: "bogus" }).success).toBe(
      false,
    );
  });

  it("rejects the retired upload fields (now text boxes)", () => {
    expect(
      uploadMetaSchema.safeParse({ applicationId: "x", field: "courseOutline" }).success,
    ).toBe(false);
    expect(
      uploadMetaSchema.safeParse({ applicationId: "x", field: "cvResume" }).success,
    ).toBe(false);
  });

  it("accepts the headshot field", () => {
    expect(
      uploadMetaSchema.safeParse({ applicationId: "x", field: "headshot" }).success,
    ).toBe(true);
  });
});
