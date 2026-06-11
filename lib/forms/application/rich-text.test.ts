import { describe, it, expect } from "vitest";
import { sanitizeRichText, richTextPlainLength } from "./rich-text";

describe("sanitizeRichText", () => {
  it("keeps allowed formatting tags", () => {
    const input =
      "<p>Dr. Smith is a <strong>board-certified</strong> <em>periodontist</em>.</p><ul><li>20 years</li></ul>";
    expect(sanitizeRichText(input)).toBe(input);
  });

  it("strips script tags and their content", () => {
    expect(
      sanitizeRichText("<p>Hello</p><script>alert('xss')</script>"),
    ).toBe("<p>Hello</p>");
  });

  it("strips event-handler attributes", () => {
    expect(sanitizeRichText('<p onclick="steal()">Bio</p>')).toBe("<p>Bio</p>");
  });

  it("strips links, images, and iframes but keeps inner text", () => {
    expect(
      sanitizeRichText('<a href="https://evil.example">Dr. Smith</a>'),
    ).toBe("Dr. Smith");
    expect(sanitizeRichText('<img src="x" onerror="alert(1)">')).toBe("");
    expect(sanitizeRichText('<iframe src="https://evil.example"></iframe>')).toBe(
      "",
    );
  });

  it("strips style attributes and tags", () => {
    expect(
      sanitizeRichText('<p style="position:fixed">Bio</p><style>p{}</style>'),
    ).toBe("<p>Bio</p>");
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeRichText("  <p>Bio</p>  ")).toBe("<p>Bio</p>");
  });
});

describe("richTextPlainLength", () => {
  it("counts visible characters only", () => {
    expect(richTextPlainLength("<p><strong>Hello</strong> world</p>")).toBe(11);
  });

  it("returns 0 for markup with no text", () => {
    expect(richTextPlainLength("<p><br></p><ul><li> </li></ul>")).toBe(0);
  });

  it("collapses whitespace between blocks", () => {
    expect(richTextPlainLength("<p>a</p>\n\n<p>b</p>")).toBe(3);
  });
});
