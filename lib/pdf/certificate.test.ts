import { describe, it, expect } from "vitest";
import { renderCertificatePdf } from "@/lib/pdf/certificate";

describe("renderCertificatePdf", () => {
  it("returns a non-empty PDF buffer", async () => {
    const buf = await renderCertificatePdf({
      attendeeName: "Jane Hygienist",
      courseTitle: "Infection Control Essentials",
      courseIdNumber: "ACE-2026-00042",
      certificateId: "11111111-1111-1111-1111-111111111111",
      ceHours: 2,
      completedAt: new Date("2026-06-02T12:00:00Z"),
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });
});
