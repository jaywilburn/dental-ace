import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import ApplicationRejectedEmail from "@/emails/application-rejected";
import ReviewReopenedEmail from "@/emails/review-reopened";

/*
  These two templates run on the reject and reopen paths in production, and a
  template that throws takes the whole action down with it. Both were changed on
  2026-07-29: application-rejected gained a required revisionUrl and its first
  ever CTA, and review-reopened is new. Rendering them here is the cheapest way
  to know they work, since the send helper logs BEFORE React Email renders, so a
  log line proves nothing.
*/

const REJECTED_PROPS = {
  companyName: "Smile Together",
  courseTitle: "Event: Smile Together",
  submittedAt: "July 28, 2026",
  decisionAt: "July 29, 2026",
  reviewerFeedback: "Where is the information about the company?",
  revisionUrl: "https://www.dentalace.org/company/events/abc-123",
};

const REOPENED_PROPS = {
  companyName: "Smile Together",
  itemTitle: "Event: Smile Together",
  detailUrl: "https://www.dentalace.org/company/events/abc-123",
};

describe("ApplicationRejectedEmail", () => {
  it("renders without throwing", async () => {
    const html = await render(ApplicationRejectedEmail(REJECTED_PROPS));
    expect(html).toContain("<html");
    expect(html.length).toBeGreaterThan(500);
  });

  it("includes the reviewer feedback and a working revision link", async () => {
    const html = await render(ApplicationRejectedEmail(REJECTED_PROPS));
    expect(html).toContain("Where is the information about the company?");
    expect(html).toContain(REJECTED_PROPS.revisionUrl);
    expect(html).toContain("Revise and Resubmit");
  });

  // The copy change that matters: this template used to promise a charge that
  // the product no longer makes (client decision 2026-07-29).
  it("no longer says a new credit is required", async () => {
    const html = await render(ApplicationRejectedEmail(REJECTED_PROPS));
    expect(html).not.toMatch(/new application credit will be required/i);
    expect(html).toMatch(/no new credit is required/i);
  });

  it("has a subject line", () => {
    expect(ApplicationRejectedEmail.subject(REJECTED_PROPS)).toContain("Smile Together");
  });
});

describe("ReviewReopenedEmail", () => {
  it("renders without throwing", async () => {
    const html = await render(ReviewReopenedEmail(REOPENED_PROPS));
    expect(html).toContain("<html");
    expect(html.length).toBeGreaterThan(500);
  });

  it("tells the provider it is back under review, with a link", async () => {
    const html = await render(ReviewReopenedEmail(REOPENED_PROPS));
    expect(html).toContain("Smile Together");
    expect(html).toContain(REOPENED_PROPS.detailUrl);
    expect(html).toMatch(/no action is needed/i);
  });

  it("has a subject line", () => {
    expect(ReviewReopenedEmail.subject(REOPENED_PROPS)).toContain("Back Under Review");
  });
});
