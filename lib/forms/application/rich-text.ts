import sanitizeHtml from "sanitize-html";

/*
  Sanitization for the detailed-bio rich text (course application Step 2).
  The bio is authored in a contentEditable editor by the company and rendered
  later inside the reviewer and review screens, so everything stored MUST pass
  through this allowlist: formatting tags only, no attributes, no links, no
  media. Sanitize on write (saveStep2) and again at render for defense in
  depth.
*/

const ALLOWED_TAGS = ["b", "strong", "i", "em", "u", "p", "br", "ul", "ol", "li"];

export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {},
    disallowedTagsMode: "discard",
  }).trim();
}

/** Visible text length of an HTML fragment (tags stripped, whitespace collapsed). */
export function richTextPlainLength(html: string): number {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim().length;
}
