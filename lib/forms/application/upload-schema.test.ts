import { describe, it, expect } from "vitest";
import {
  validateUpload,
  sanitizeFilename,
  buildAttachmentPath,
  uploadMetaSchema,
} from "@/lib/forms/application/upload-schema";

describe("validateUpload", () => {
  it("accepts a PDF outline within the size limit", () => {
    expect(
      validateUpload("courseOutline", { type: "application/pdf", size: 1024 }),
    ).toBeNull();
  });

  it("accepts a .docx outline and an image", () => {
    expect(
      validateUpload("courseOutline", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: 2048,
      }),
    ).toBeNull();
    expect(
      validateUpload("cvResume", { type: "image/png", size: 2048 }),
    ).toBeNull();
  });

  it("rejects an oversize file", () => {
    expect(
      validateUpload("courseOutline", { type: "application/pdf", size: 11 * 1024 * 1024 }),
    ).toMatch(/too large/i);
  });

  it("rejects an empty file", () => {
    expect(
      validateUpload("courseOutline", { type: "application/pdf", size: 0 }),
    ).toMatch(/empty/i);
  });

  it("rejects an unsupported MIME type", () => {
    expect(
      validateUpload("courseOutline", { type: "application/zip", size: 1024 }),
    ).toMatch(/unsupported/i);
  });

  it("restricts headshots to images and rejects PDFs", () => {
    expect(validateUpload("headshot", { type: "image/jpeg", size: 1024 })).toBeNull();
    expect(
      validateUpload("headshot", { type: "application/pdf", size: 1024 }),
    ).toMatch(/unsupported/i);
  });

  it("rejects a headshot over 5 MB", () => {
    expect(
      validateUpload("headshot", { type: "image/png", size: 6 * 1024 * 1024 }),
    ).toMatch(/too large/i);
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

  it("accepts a valid field", () => {
    expect(
      uploadMetaSchema.safeParse({ applicationId: "x", field: "cvResume" }).success,
    ).toBe(true);
  });
});
