import { describe, it, expect } from "vitest";
import {
  hasInvalidTld,
  invalidTldMessage,
  redactEmails,
  suggestEmailFix,
} from "@/lib/attend/email-typo";

describe("suggestEmailFix", () => {
  it("fixes the .con typo", () => {
    expect(suggestEmailFix("jane@gmail.con")).toBe("jane@gmail.com");
    expect(suggestEmailFix("jane@smiledental.con")).toBe("jane@smiledental.com");
  });

  it("fixes the other non-existent TLD typos", () => {
    expect(suggestEmailFix("jane@example.cmo")).toBe("jane@example.com");
    expect(suggestEmailFix("jane@example.ocm")).toBe("jane@example.com");
    expect(suggestEmailFix("jane@example.comm")).toBe("jane@example.com");
    expect(suggestEmailFix("jane@example.nte")).toBe("jane@example.net");
    expect(suggestEmailFix("jane@example.ogr")).toBe("jane@example.org");
  });

  it("handles uppercase input, lowercasing the domain but keeping the local part", () => {
    expect(suggestEmailFix("Jane.Doe@GMAIL.CON")).toBe("Jane.Doe@gmail.com");
  });

  it("trims surrounding whitespace", () => {
    expect(suggestEmailFix("  jane@gmail.con  ")).toBe("jane@gmail.com");
  });

  it("leaves real look-alike country TLDs alone (.cm Cameroon, .co Colombia)", () => {
    expect(suggestEmailFix("jane@example.cm")).toBeNull();
    expect(suggestEmailFix("jane@example.co")).toBeNull();
    expect(suggestEmailFix("jane@example.co.uk")).toBeNull();
  });

  it("fixes common provider misspellings", () => {
    expect(suggestEmailFix("jane@gmial.com")).toBe("jane@gmail.com");
    expect(suggestEmailFix("jane@gamil.com")).toBe("jane@gmail.com");
    expect(suggestEmailFix("jane@yahooo.com")).toBe("jane@yahoo.com");
    expect(suggestEmailFix("jane@hotmial.com")).toBe("jane@hotmail.com");
    expect(suggestEmailFix("jane@icoud.com")).toBe("jane@icloud.com");
    expect(suggestEmailFix("jane@outlok.com")).toBe("jane@outlook.com");
  });

  it("fixes a TLD typo and a provider misspelling together", () => {
    expect(suggestEmailFix("jane@gmial.con")).toBe("jane@gmail.com");
  });

  it("returns null for a valid address", () => {
    expect(suggestEmailFix("jane@gmail.com")).toBeNull();
    expect(suggestEmailFix("Jane@Gmail.com")).toBeNull();
    expect(suggestEmailFix("jane@aadb.org")).toBeNull();
  });

  it("returns null for input that is not an address yet", () => {
    expect(suggestEmailFix("")).toBeNull();
    expect(suggestEmailFix("jane")).toBeNull();
    expect(suggestEmailFix("jane@")).toBeNull();
    expect(suggestEmailFix("@gmail.con")).toBeNull();
    expect(suggestEmailFix("jane@localhost")).toBeNull();
  });

  it("never matches inherited object keys", () => {
    expect(suggestEmailFix("jane@example.constructor")).toBeNull();
    expect(hasInvalidTld("jane@example.__proto__")).toBe(false);
  });
});

describe("hasInvalidTld", () => {
  it("flags non-existent TLDs regardless of case and whitespace", () => {
    expect(hasInvalidTld("jane@gmail.con")).toBe(true);
    expect(hasInvalidTld(" JANE@GMAIL.CON ")).toBe(true);
    expect(hasInvalidTld("jane@example.ogr")).toBe(true);
  });

  it("does not flag real TLDs or provider misspellings", () => {
    expect(hasInvalidTld("jane@gmail.com")).toBe(false);
    expect(hasInvalidTld("jane@example.cm")).toBe(false);
    expect(hasInvalidTld("jane@example.co")).toBe(false);
    expect(hasInvalidTld("jane@gmial.com")).toBe(false);
  });
});

describe("invalidTldMessage", () => {
  it("suggests the corrected address for an invalid TLD", () => {
    expect(invalidTldMessage("jane@gmail.con")).toBe(
      "Check your email address. Did you mean jane@gmail.com?",
    );
  });

  it("is null for a provider misspelling alone (it could be a real domain)", () => {
    expect(invalidTldMessage("jane@gmial.com")).toBeNull();
    expect(invalidTldMessage("jane@gmail.com")).toBeNull();
  });
});

describe("redactEmails", () => {
  it("removes addresses from a logged message", () => {
    const logged = JSON.stringify({
      attendeeEmail: ["Check your email address. Did you mean jane@gmail.com?"],
    });
    expect(redactEmails(logged)).not.toContain("jane");
    expect(redactEmails(logged)).toContain("Did you mean [email]?");
  });
});
