import { describe, expect, it } from "vitest";
import {
  describeSignup,
  signupNotificationRecipients,
  type SignupUser,
} from "@/lib/auth/signup-notification";

/*
  describeSignup is the single source of truth for the signup-notification "type"
  vocabulary across every activation path (self-serve verification, admin-manual
  verification, admin-provisioned staff). staffRole must win (admin-created),
  then board over the individual fallback, then company/staff intent, then the
  individual license (or none).
*/

const base: SignupUser = {
  staffRole: "NONE",
  signupIntent: null,
  boardId: null,
  licenses: [],
  accessRequests: [],
};

describe("describeSignup", () => {
  it("individual with a primary license shows the license", () => {
    const out = describeSignup({
      ...base,
      licenses: [{ state: "TX", licenseType: "RDH", licenseNumber: "TX-RDH-91043" }],
    });
    expect(out.typeLabel).toBe("Individual (ProTrack)");
    expect(out.detailRows).toEqual([
      { label: "License", value: "RDH · Texas · TX-RDH-91043" },
    ]);
  });

  it("individual with no license says so", () => {
    const out = describeSignup(base);
    expect(out.typeLabel).toBe("Individual (ProTrack)");
    expect(out.detailRows).toEqual([{ label: "License", value: "No license on file" }]);
  });

  it("company intent is labelled CE Provider", () => {
    const out = describeSignup({ ...base, signupIntent: "COMPANY" });
    expect(out.typeLabel).toBe("CE Provider (company)");
    expect(out.detailRows[0]?.label).toBe("Note");
  });

  it("staff intent is labelled self-requested staff", () => {
    const out = describeSignup({ ...base, signupIntent: "STAFF" });
    expect(out.typeLabel).toBe("Staff (self-requested)");
    expect(out.detailRows).toEqual([]);
  });

  it("a BOARD access request wins over the individual fallback and shows the board", () => {
    const out = describeSignup({
      ...base,
      accessRequests: [{ label: "Texas, Texas State Board of Dental Examiners" }],
      // a board registrant still carries a license-less FREE profile
      licenses: [],
    });
    expect(out.typeLabel).toBe("State Board");
    expect(out.detailRows).toEqual([
      { label: "Board", value: "Texas, Texas State Board of Dental Examiners" },
    ]);
  });

  it("an approved board user (boardId set, no pending request) is still State Board", () => {
    const out = describeSignup({ ...base, boardId: "board-uuid" });
    expect(out.typeLabel).toBe("State Board");
  });

  it("admin-created ADMIN staff is labelled Staff (Admin), created by an admin", () => {
    const out = describeSignup({ ...base, staffRole: "ADMIN" });
    expect(out.typeLabel).toBe("Staff (Admin)");
    expect(out.detailRows).toEqual([{ label: "Origin", value: "Created by an admin" }]);
  });

  it("admin-created REVIEWER staff is labelled Staff (Reviewer)", () => {
    const out = describeSignup({ ...base, staffRole: "REVIEWER" });
    expect(out.typeLabel).toBe("Staff (Reviewer)");
  });

  it("staffRole wins even when the row also has a license or board request", () => {
    const out = describeSignup({
      ...base,
      staffRole: "REVIEWER",
      accessRequests: [{ label: "Ohio, Ohio Board" }],
      licenses: [{ state: "OH", licenseType: "DDS_DMD", licenseNumber: "OH-1" }],
    });
    expect(out.typeLabel).toBe("Staff (Reviewer)");
  });
});

describe("signupNotificationRecipients", () => {
  it("parses AADB_ADMIN_EMAIL as a comma-separated list", () => {
    const prev = process.env.AADB_ADMIN_EMAIL;
    process.env.AADB_ADMIN_EMAIL = "info@dentalace.org, ops@dentalace.org";
    try {
      expect(signupNotificationRecipients()).toEqual([
        "info@dentalace.org",
        "ops@dentalace.org",
      ]);
    } finally {
      if (prev === undefined) delete process.env.AADB_ADMIN_EMAIL;
      else process.env.AADB_ADMIN_EMAIL = prev;
    }
  });

  it("falls back to info@dentalace.org when unset", () => {
    const prev = process.env.AADB_ADMIN_EMAIL;
    delete process.env.AADB_ADMIN_EMAIL;
    try {
      expect(signupNotificationRecipients()).toEqual(["info@dentalace.org"]);
    } finally {
      if (prev !== undefined) process.env.AADB_ADMIN_EMAIL = prev;
    }
  });
});
