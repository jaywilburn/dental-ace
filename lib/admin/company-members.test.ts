import { describe, it, expect } from "vitest";
import { memberDisplayName, pointOfContactId } from "@/lib/admin/company-members";

describe("memberDisplayName", () => {
  it("joins first and last name", () => {
    expect(
      memberDisplayName({ email: "abbie@example.com", firstName: "Abbie", lastName: "Ginis" }),
    ).toBe("Abbie Ginis");
  });

  it("uses a lone first name without trailing whitespace", () => {
    expect(
      memberDisplayName({ email: "abbie@example.com", firstName: "Abbie", lastName: null }),
    ).toBe("Abbie");
  });

  it("uses a lone last name", () => {
    expect(
      memberDisplayName({ email: "abbie@example.com", firstName: null, lastName: "Ginis" }),
    ).toBe("Ginis");
  });

  it("falls back to the email when both names are missing", () => {
    expect(
      memberDisplayName({ email: "abbie@example.com", firstName: null, lastName: null }),
    ).toBe("abbie@example.com");
  });

  it("treats empty-string names as missing", () => {
    expect(
      memberDisplayName({ email: "abbie@example.com", firstName: "", lastName: "" }),
    ).toBe("abbie@example.com");
  });
});

describe("pointOfContactId", () => {
  const at = (iso: string) => new Date(iso);

  it("returns null for an empty member list", () => {
    expect(pointOfContactId([])).toBeNull();
  });

  it("returns the only member's id", () => {
    expect(pointOfContactId([{ id: "a", createdAt: at("2026-07-01T00:00:00Z") }])).toBe("a");
  });

  it("picks the earliest-created member regardless of list order", () => {
    expect(
      pointOfContactId([
        { id: "later", createdAt: at("2026-07-10T00:00:00Z") },
        { id: "earliest", createdAt: at("2026-06-01T00:00:00Z") },
        { id: "middle", createdAt: at("2026-06-15T00:00:00Z") },
      ]),
    ).toBe("earliest");
  });

  it("keeps the first member in list order on a createdAt tie", () => {
    const tied = at("2026-07-01T00:00:00Z");
    expect(
      pointOfContactId([
        { id: "first", createdAt: tied },
        { id: "second", createdAt: tied },
      ]),
    ).toBe("first");
  });
});
