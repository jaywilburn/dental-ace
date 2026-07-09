import { describe, expect, it, vi } from "vitest";
import {
  courseAssetUrls,
  signOrRegenerateAssetUrl,
  signViewAndDownloadUrls,
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

describe("signViewAndDownloadUrls", () => {
  it("signs the view URL once and derives the download URL from it", async () => {
    const calls: Array<{ path: string; download?: string }> = [];
    const io: AssetIo = {
      sign: vi.fn(async (path: string, download?: string) => {
        calls.push({ path, download });
        return `https://signed.example/${path}?token=sig`;
      }),
      upload: vi.fn(),
    };

    const result = await signViewAndDownloadUrls(
      "qrcodes/app-1.png",
      "ACE-2026-00001-attendee-qr.png",
      pngRender,
      io,
    );

    expect(result.viewUrl).toBe("https://signed.example/qrcodes/app-1.png?token=sig");
    // Download URL is the view URL with the download query param appended,
    // exactly as the storage client would build it — no second sign round-trip.
    expect(result.downloadUrl).toBe(
      "https://signed.example/qrcodes/app-1.png?token=sig&download=ACE-2026-00001-attendee-qr.png",
    );
    // io.sign was called exactly once (the view URL), never with a download option.
    expect(calls).toEqual([{ path: "qrcodes/app-1.png", download: undefined }]);
    expect(io.upload).not.toHaveBeenCalled();
  });

  it("url-encodes special characters in the download filename", async () => {
    const io: AssetIo = {
      sign: vi.fn(async (path: string) => `https://signed.example/${path}?token=sig`),
      upload: vi.fn(),
    };

    const result = await signViewAndDownloadUrls(
      "qrcodes/app-1.png",
      "Spring Symposium & Co.png",
      pngRender,
      io,
    );

    expect(result.downloadUrl).toBe(
      "https://signed.example/qrcodes/app-1.png?token=sig&download=Spring+Symposium+%26+Co.png",
    );
  });

  it("regenerates the object at most once and derives the download URL", async () => {
    let healed = false;
    const upload = vi.fn(async (args: { path: string }) => {
      healed = true;
      return { storagePath: args.path };
    });
    const sign = vi.fn(async (path: string) => {
      if (!healed) throw new Error("Object not found");
      return `https://signed.example/${path}?token=sig`;
    });

    const result = await signViewAndDownloadUrls(
      "qrcodes/app-1.png",
      "ACE-2026-00001-attendee-qr.png",
      pngRender,
      { sign, upload },
    );

    expect(result.viewUrl).toBe("https://signed.example/qrcodes/app-1.png?token=sig");
    expect(result.downloadUrl).toBe(
      "https://signed.example/qrcodes/app-1.png?token=sig&download=ACE-2026-00001-attendee-qr.png",
    );
    // Regeneration + upload ran exactly once.
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("returns both nulls when the object cannot be ensured", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const io: AssetIo = {
      sign: vi.fn().mockRejectedValue(new Error("Object not found")),
      upload: vi.fn().mockRejectedValue(new Error("bucket gone")),
    };

    const result = await signViewAndDownloadUrls(
      "qrcodes/app-1.png",
      "ACE-2026-00001-attendee-qr.png",
      pngRender,
      io,
    );

    expect(result).toEqual({ viewUrl: null, downloadUrl: null });
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

  it("signs the QR as an inline view URL plus a download URL named for the course", async () => {
    const calls: Array<{ path: string; download?: string }> = [];
    const io: AssetIo = {
      sign: vi.fn(async (path: string, download?: string) => {
        calls.push({ path, download });
        return download
          ? `https://signed.example/${path}?download=${download}`
          : `https://signed.example/${path}`;
      }),
      upload: vi.fn(),
    };

    const result = await courseAssetUrls(baseCourse, io);

    expect(result.qrViewUrl).toBe("https://signed.example/qrcodes/app-1.png");
    expect(result.qrDownloadUrl).toBe(
      "https://signed.example/qrcodes/app-1.png&download=ACE-2026-00001-attendee-qr.png",
    );
    expect(result.letterDownloadUrl).toBe(
      "https://signed.example/approval-letters/app-1.pdf",
    );

    // The QR path is signed exactly once (the inline view URL, no download
    // option); the QR download URL is derived from it, not signed again.
    const qrCalls = calls.filter((c) => c.path === "qrcodes/app-1.png");
    expect(qrCalls).toEqual([{ path: "qrcodes/app-1.png", download: undefined }]);
    expect(io.upload).not.toHaveBeenCalled();
  });

  it("returns nulls without any storage IO when no paths were recorded", async () => {
    const io: AssetIo = { sign: vi.fn(), upload: vi.fn() };

    const result = await courseAssetUrls(
      { ...baseCourse, qrCodeUrl: null, approvalLetterUrl: null },
      io,
    );

    expect(result).toEqual({
      qrViewUrl: null,
      qrDownloadUrl: null,
      letterDownloadUrl: null,
    });
    expect(io.sign).not.toHaveBeenCalled();
    expect(io.upload).not.toHaveBeenCalled();
  });

  it("regenerates real QR and approval-letter bytes when the objects are missing", async () => {
    const uploaded: Array<{ path: string; body: Buffer; contentType: string }> = [];
    let healed = false;
    const io: AssetIo = {
      sign: vi.fn(async (path: string, download?: string) => {
        if (!healed) throw new Error("Object not found");
        return download
          ? `https://signed.example/${path}?download=${download}`
          : `https://signed.example/${path}`;
      }),
      upload: vi.fn(async (args) => {
        uploaded.push(args);
        healed = true;
        return { storagePath: args.path };
      }),
    };

    const result = await courseAssetUrls(baseCourse, io);

    expect(result.qrViewUrl).toBe("https://signed.example/qrcodes/app-1.png");
    expect(result.qrDownloadUrl).toBe(
      "https://signed.example/qrcodes/app-1.png&download=ACE-2026-00001-attendee-qr.png",
    );
    expect(result.letterDownloadUrl).toBe(
      "https://signed.example/approval-letters/app-1.pdf",
    );

    // The QR is regenerated + uploaded exactly once; the download URL is derived
    // from the single signed view URL.
    const qrUploads = uploaded.filter((u) => u.contentType === "image/png");
    expect(qrUploads).toHaveLength(1);

    const qr = qrUploads[0];
    const letter = uploaded.find((u) => u.contentType === "application/pdf");
    expect(qr?.path).toBe("qrcodes/app-1.png");
    // PNG magic bytes
    expect(qr?.body.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(letter?.path).toBe("approval-letters/app-1.pdf");
    // PDF magic bytes
    expect(letter?.body.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
});
