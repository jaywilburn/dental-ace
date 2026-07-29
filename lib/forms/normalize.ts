/*
  Form-text normalization, shared by every wizard raw-slice builder.

  WHY THIS EXISTS (the "I stayed inside the box and it still rejected" bug):
  a <textarea maxlength="2000"> measures its API value, where a newline is ONE
  character (\n). But per the HTML form-submission spec the posted value has
  newlines normalized to CRLF, so each newline costs TWO bytes on the wire. A
  textarea the browser happily accepted at 2,000 characters can therefore POST
  up to ~4,000 and blow a server-side z.string().max(2000).

  Providers hit this constantly on the fields whose own hint text asks for one
  item per line ("Minimum 3, list each on a new line") and on pasted outlines,
  which are mostly newlines. Folding CRLF back to LF before validation makes the
  browser cap and the Zod cap measure the same thing.

  Also trims, so whitespace-only input reads as empty rather than passing a
  .min() check on spaces.
*/

/**
 * Normalize one form field into the string the schemas validate: CRLF (and lone
 * CR) folded to LF, then trimmed. Non-string entries (a File from a multipart
 * form, or a missing key) become "".
 */
export function normalizeFormText(value: FormDataEntryValue | null | undefined): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").trim();
}
