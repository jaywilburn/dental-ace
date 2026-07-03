import { describe, expect, it, vi } from "vitest";
import {
  courseAssetUrls,
  signOrRegenerateAssetUrl,
  type AssetIo,
} from "./course-assets";

// The real approval-letter regeneration path (courseAssetUrls -> ... ->
// renderApprovalLetterPdf) now loads the signatory via getLetterSignatory(),
// which reads PlatformSettings through Prisma. The shared vitest Prisma stub
// (test/stubs/prisma.ts) is an empty object with no DB behind it, so mock the
// signatory lookup directly rather than reaching for a live database.
vi.mock("@/lib/admin/letter-settings", () => ({
  getLetterSignatory: vi.fn().mockResolvedValue({
    presidentName: "Dr. Clifford Feingold, DDS",
    presidentTitle: "President, American Association of Dental Boards",
    signatureImage: null,
  }),
}));

const pngRender = async () => ({
  body: Buffer.from("png-bytes"),
  contentType: "image/png",
});

describe("signOrRegenerateAssetUrl", () => {
  it("returns the signed URL without regenerating when the object exists", async () => {
    const io: AssetIo = {
      sign: vi.fn().mockResolvedValue("https://signed.example/qr.png"),
      upload: vi.fn(),
    };
    const render = vi.fn(pngRender);

    const url = await signOrRegenerateAssetUrl("qrcodes/app-1.png", render, io);

    expect(url).toBe("https://signed.example/qr.png");
    expect(render).not.toHaveBeenCalled();
    expect(io.upload).not.toHaveBeenCalled();
  });

  it("regenerates, uploads to the recorded path, and re-signs when the object is missing", async () => {
    const sign = vi
      .fn()
      .mockRejectedValueOnce(new Error("Object not found"))
      .mockResolvedValueOnce("https://signed.example/healed.png");
    const upload = vi.fn().mockResolvedValue({ storagePath: "qrcodes/app-1.png" });
    const render = vi.fn(pngRender);

    const url = await signOrRegenerateAssetUrl("qrcodes/app-1.png", render, {
      sign,
      upload,
    });

    expect(url).toBe("https://signed.example/healed.png");
    expect(render).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith({
      path: "qrcodes/app-1.png",
      body: Buffer.from("png-bytes"),
      contentType: "image/png",
    });
    expect(sign).toHaveBeenCalledTimes(2);
  });

  it("returns null and logs when regeneration also fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const io: AssetIo = {
      sign: vi.fn().mockRejectedValue(new Error("Object not found")),
      upload: vi.fn().mockRejectedValue(new Error("bucket gone")),
    };

    const url = await signOrRegenerateAssetUrl("qrcodes/app-1.png", pngRender, io);

    expect(url).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("qrcodes/app-1.png"),
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  it("returns null when the render itself throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const io: AssetIo = {
      sign: vi.fn().mockRejectedValue(new Error("Object not found")),
      upload: vi.fn(),
    };

    const url = await signOrRegenerateAssetUrl(
      "approval-letters/app-1.pdf",
      async () => {
        throw new Error("render exploded");
      },
      io,
    );

    expect(url).toBeNull();
    expect(io.upload).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("courseAssetUrls", () => {
  const baseCourse = {
    attendeeLinkToken: "tok-123",
    qrCodeUrl: "qrcodes/app-1.png" as string | null,
    approvalLetterUrl: "approval-letters/app-1.pdf" as string | null,
    courseIdNumber: "ACE-2026-00001",
    approvedAt: new Date("2026-06-01T00:00:00Z"),
    expiresAt: new Date("2029-06-01T00:00:00Z"),
    companyName: "Texas Dental Association",
    courseTitle: "Infection Control Essentials",
    ceHours: 1.5,
  };

  it("signs both assets without rendering when objects exist", async () => {
    const io: AssetIo = {
      sign: vi.fn(async (path: string) => `https://signed.example/${path}`),
      upload: vi.fn(),
    };

    const result = await courseAssetUrls(baseCourse, io);

    expect(result.qrDownloadUrl).toBe("https://signed.example/qrcodes/app-1.png");
    expect(result.letterDownloadUrl).toBe(
      "https://signed.example/approval-letters/app-1.pdf",
    );
    expect(io.upload).not.toHaveBeenCalled();
  });

  it("returns nulls without any storage IO when no paths were recorded", async () => {
    const io: AssetIo = { sign: vi.fn(), upload: vi.fn() };

    const result = await courseAssetUrls(
      { ...baseCourse, qrCodeUrl: null, approvalLetterUrl: null },
      io,
    );

    expect(result).toEqual({ qrDownloadUrl: null, letterDownloadUrl: null });
    expect(io.sign).not.toHaveBeenCalled();
    expect(io.upload).not.toHaveBeenCalled();
  });

  it("regenerates real QR and approval-letter bytes when the objects are missing", async () => {
    const uploaded: Array<{ path: string; body: Buffer; contentType: string }> = [];
    let healed = false;
    const io: AssetIo = {
      sign: vi.fn(async (path: string) => {
        if (!healed) throw new Error("Object not found");
        return `https://signed.example/${path}`;
      }),
      upload: vi.fn(async (args) => {
        uploaded.push(args);
        healed = true;
        return { storagePath: args.path };
      }),
    };

    const result = await courseAssetUrls(baseCourse, io);

    expect(result.qrDownloadUrl).toBe("https://signed.example/qrcodes/app-1.png");
    expect(result.letterDownloadUrl).toBe(
      "https://signed.example/approval-letters/app-1.pdf",
    );

    const qr = uploaded.find((u) => u.contentType === "image/png");
    const letter = uploaded.find((u) => u.contentType === "application/pdf");
    expect(qr?.path).toBe("qrcodes/app-1.png");
    // PNG magic bytes
    expect(qr?.body.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(letter?.path).toBe("approval-letters/app-1.pdf");
    // PDF magic bytes
    expect(letter?.body.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
});
