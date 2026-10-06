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

  it("follows the brand copy rules (no em dashes)", () => {
    const copy = submitConfirmCopy("selective")!;
    const all = [copy.title, ...copy.body, copy.confirmLabel, copy.cancelLabel].join(" ");
    expect(all).not.toContain("—");
  });
});
