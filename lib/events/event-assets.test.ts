import { describe, expect, it, vi } from "vitest";
import type { AssetIo } from "@/lib/courses/course-assets";
import { eventAssetUrls } from "./event-assets";

// Regeneration (the object-missing path) renders the approval letter, which
// reads the signatory via getLetterSignatory() -> Prisma. The shared vitest
// Prisma stub has no DB behind it, so mock the signatory lookup directly.
vi.mock("@/lib/admin/letter-settings", () => ({
  getLetterSignatory: vi.fn().mockResolvedValue({
    presidentName: "Dr. Clifford Feingold, DDS",
    presidentTitle: "President, American Association of Dental Boards",
    signatureImage: null,
  }),
}));

describe("eventAssetUrls", () => {
  const baseEvent = {
    attendeeLinkToken: "evt-tok-9",
    qrCodeUrl: "qrcodes/event-1.png" as string | null,
    approvalLetterUrl: "approval-letters/event-1.pdf" as string | null,
    eventIdNumber: "ACE-EVT-2026-00007",
    eventName: "Spring Clinical Symposium",
    companyName: "Texas Dental Association",
    totalHours: 6,
    approvedAt: new Date("2026-06-01T00:00:00Z"),
    expiresAt: new Date("2029-06-01T00:00:00Z"),
  };

  it("signs the QR as an inline view URL and derives a download URL named for the event", async () => {
    const calls: Array<{ path: string; download?: string }> = [];
    const io: AssetIo = {
      sign: vi.fn(async (path: string, download?: string) => {
        calls.push({ path, download });
        return `https://signed.example/${path}`;
      }),
      upload: vi.fn(),
    };

    const result = await eventAssetUrls(baseEvent, io);

    expect(result.qrViewUrl).toBe("https://signed.example/qrcodes/event-1.png");
    expect(result.qrDownloadUrl).toBe(
      "https://signed.example/qrcodes/event-1.png&download=ACE-EVT-2026-00007-attendee-qr.png",
    );
    expect(result.letterDownloadUrl).toBe(
      "https://signed.example/approval-letters/event-1.pdf",
    );

    // The QR path is signed exactly once (the view URL); the download URL is
    // derived from it, not signed again.
    const qrCalls = calls.filter((c) => c.path === "qrcodes/event-1.png");
    expect(qrCalls).toEqual([{ path: "qrcodes/event-1.png", download: undefined }]);
    expect(io.upload).not.toHaveBeenCalled();
  });

  it("returns nulls without any storage IO when no paths were recorded", async () => {
    const io: AssetIo = { sign: vi.fn(), upload: vi.fn() };

    const result = await eventAssetUrls(
      { ...baseEvent, qrCodeUrl: null, approvalLetterUrl: null },
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

  it("regenerates real QR bytes once when the object is missing, then derives the download URL", async () => {
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

    const result = await eventAssetUrls(
      { ...baseEvent, approvalLetterUrl: null },
      io,
    );

    expect(result.qrViewUrl).toBe("https://signed.example/qrcodes/event-1.png");
    expect(result.qrDownloadUrl).toBe(
      "https://signed.example/qrcodes/event-1.png&download=ACE-EVT-2026-00007-attendee-qr.png",
    );

    const qrUploads = uploaded.filter((u) => u.contentType === "image/png");
    expect(qrUploads).toHaveLength(1);
    // PNG magic bytes
    expect(qrUploads[0]?.body.subarray(0, 4)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
  });
});
