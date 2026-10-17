import { describe, expect, it } from "vitest";
import { submitConfirmCopy } from "@/lib/attend/submit-confirm";

describe("submitConfirmCopy", () => {
  it("asks selective-event attendees to confirm a one-time submission", () => {
    const copy = submitConfirmCopy("selective");
    expect(copy).not.toBeNull();
    expect(copy!.title).toBe("Submit for your certificate?");
    expect(copy!.body.join(" ")).toMatch(/only submit once/);
    expect(copy!.body.join(" ")).toMatch(/after your last one/);
    expect(copy!.confirmLabel).toBe("Yes, submit now");
    expect(copy!.cancelLabel).toBe("Not yet");
  });

  it("needs no confirmation for full-attendance events", () => {
    expect(submitConfirmCopy("full")).toBeNull();
  });

  it("adds an attendance-code check line only when codes are present", () => {
    expect(submitConfirmCopy("selective")!.body).toHaveLength(2);
    expect(submitConfirmCopy("selective", { hasCodes: false })!.body).toHaveLength(2);
    const withCodes = submitConfirmCopy("selective", { hasCodes: true })!;
    expect(withCodes.body).toHaveLength(3);
    expect(withCodes.body[2]).toMatch(/attendance codes/);
    expect(withCodes.body[2]).toMatch(/not be able to correct it later/);
  });

  it("still needs no confirmation for full-attendance events with codes flagged", () => {
    expect(submitConfirmCopy("full", { hasCodes: true })).toBeNull();
  });

  it("follows the brand copy rules (no em dashes)", () => {
    for (const hasCodes of [false, true]) {
      const copy = submitConfirmCopy("selective", { hasCodes })!;
      const all = [copy.title, ...copy.body, copy.confirmLabel, copy.cancelLabel].join(" ");
      expect(all).not.toContain("—");
    }
  });
});
