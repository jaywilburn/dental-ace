import { describe, expect, it, vi } from "vitest";
import { attachIssuedCertToMatchingAccount, type AceSyncClient } from "@/lib/protrack/ace-sync-core";

/*
  The core attach must run entirely through the client it is given, so a
  script's transaction (scripts/correct-attendee-email-typos.ts) rolls the
  ProTrack link back with everything else.
*/
const issuedRow = {
  id: "cert-1",
  passed: true,
  attendeeEmail: "kyle@example.com",
  courseType: null,
  deliveryMethod: "Online Live",
  certPdfUrl: "cert-1.pdf",
  completedAt: new Date("2026-08-11T12:00:00Z"),
  ceHours: null,
  issuedAt: new Date("2026-08-11T18:00:00Z"),
  company: { name: "Limitless on Demand" },
  course: { application: { ceHours: 2, courseTitle: "Mastering Immediate Implants" } },
  event: null,
};

function fakeClient(user: { id: string } | null) {
  const createMany = vi.fn().mockResolvedValue({ count: 1 });
  const client = {
    issuedCertificate: { findUnique: vi.fn().mockResolvedValue(issuedRow) },
    user: { findFirst: vi.fn().mockResolvedValue(user) },
    ceCertificate: { createMany },
  } as unknown as AceSyncClient;
  return { client, createMany };
}

describe("attachIssuedCertToMatchingAccount", () => {
  it("creates the ProTrack copy through the given client, idempotently", async () => {
    const { client, createMany } = fakeClient({ id: "user-1" });
    await expect(attachIssuedCertToMatchingAccount(client, "cert-1")).resolves.toEqual({
      status: "attached",
      email: "kyle@example.com",
    });
    const arg = createMany.mock.calls[0][0];
    expect(arg.skipDuplicates).toBe(true);
    expect(arg.data[0]).toMatchObject({
      licenseeId: "user-1",
      issuedCertificateId: "cert-1",
      courseTitle: "Mastering Immediate Implants",
      provider: "Limitless on Demand",
      hours: 2,
    });
  });

  it("writes nothing when no account owns the email", async () => {
    const { client, createMany } = fakeClient(null);
    await expect(attachIssuedCertToMatchingAccount(client, "cert-1")).resolves.toEqual({
      status: "no_account",
      email: "kyle@example.com",
    });
    expect(createMany).not.toHaveBeenCalled();
  });
});
