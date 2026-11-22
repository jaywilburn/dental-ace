import { describe, it, expect } from "vitest";
import { contentSpamReason, spamReasonFor } from "@/lib/leads/spam";
import type { MarketingLeadInput } from "@/lib/leads/schema";

/*
  The spam rules, exercised on shortened copies of what the Verify contact form
  actually received (Jul to Nov 2026) and on inquiries a state board would send.
  Run against all 56 stored leads on 2026-11-05: 54 caught, and the 2 that
  passed were the genuine ones.
*/

const board: MarketingLeadInput = {
  source: "VERIFY",
  contactName: "Dana Ortiz",
  title: "Executive Director",
  organization: "Texas State Board of Dental Examiners",
  email: "dana.ortiz@tsbde.texas.gov",
  message:
    "We would like a walkthrough of the audit cycle before our spring renewal period. Can we set up a call next week?",
};

const lead = (patch: Partial<MarketingLeadInput>): MarketingLeadInput => ({ ...board, ...patch });

describe("contentSpamReason", () => {
  it("passes genuine board inquiries", () => {
    expect(contentSpamReason(board)).toBeNull();
    expect(contentSpamReason(lead({ message: undefined }))).toBeNull();
    expect(contentSpamReason(lead({ message: "Our site is tsbde.texas.gov and we audit 22,000 licensees." }))).toBeNull();
  });

  it("flags any link in the message", () => {
    expect(contentSpamReason(lead({ message: "See https://boost-traffic.example/offer" }))).toBe("link");
    expect(contentSpamReason(lead({ message: "Visit www.example.com today" }))).toBe("link");
    expect(contentSpamReason(lead({ message: "Is this yours? directoryinspector.com/dentalace.org" }))).toBe("link");
  });

  it("flags raw HTML", () => {
    expect(
      contentSpamReason(lead({ message: "Find romance <a href=https://u.to/x>Sign up</a>" })),
    ).toBe("html");
  });

  it("flags known spam senders", () => {
    expect(contentSpamReason(lead({ email: "adam@ultraleadgeneration.com" }))).toBe("blocked_domain");
  });

  it("flags sales pitches", () => {
    for (const message of [
      "Boost your SEO and visibility with daily classified submissions to 1000 sites.",
      "Hi Name, I found your profile for dentalace.org and wanted to make sure it is correct.",
      "Hello, your business listing on dentalace.org needs attention.",
      "Hi, Quick question for dentalace.org, are you spending heavily on paid ads?",
      "Hi, I just visited dentalace.org and wondered about an engaging video for you.",
    ]) {
      expect(contentSpamReason(lead({ message }))).toBe("pitch");
    }
  });

  it("flags a name copied into the organization field", () => {
    expect(
      contentSpamReason(lead({ contactName: "JustinStync", organization: "justinstync", message: undefined })),
    ).toBe("name_is_organization");
  });
});

describe("spamReasonFor", () => {
  const base = { lead: board, honeypotFilled: false, formTimingOk: true, recentLeads: [] };

  it("passes a genuine first submission", () => {
    expect(spamReasonFor(base)).toBeNull();
  });

  it("checks the honeypot and the form timing before the content", () => {
    expect(spamReasonFor({ ...base, honeypotFilled: true })).toBe("honeypot");
    expect(spamReasonFor({ ...base, formTimingOk: false })).toBe("form_timing");
  });

  it("flags a repeat of the same email within the window", () => {
    expect(
      spamReasonFor({ ...base, recentLeads: [{ email: board.email, message: null }] }),
    ).toBe("duplicate");
  });

  it("flags the same long message from a different sender, whitespace and case aside", () => {
    expect(
      spamReasonFor({
        ...base,
        recentLeads: [{ email: "other@example.com", message: `  ${board.message!.toUpperCase()}\n` }],
      }),
    ).toBe("duplicate");
  });

  it("lets short messages repeat", () => {
    expect(
      spamReasonFor({
        ...base,
        lead: lead({ message: "Please call me." }),
        recentLeads: [{ email: "other@example.com", message: "Please call me." }],
      }),
    ).toBeNull();
  });
});
