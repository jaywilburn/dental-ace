/*
  Attendance-code matching for SELECTIVE_INLINE "CODE" session questions. Pure
  (no DB, no server-only) so the authoring action, the scorer and tests share
  one definition of "the same code".

  Normalisation: Unicode NFKC (full-width letters/digits fold to ASCII, so a
  phone keyboard in a CJK layout still matches), then every whitespace
  character is removed (including non-breaking and ideographic spaces, which
  NFKC alone leaves in place), then lowercase. Hyphens and other punctuation
  still count: "AB-12" and "AB12" are different codes.
*/

/** Minimum code length AFTER normalisation (authoring rule). */
export const ATTENDANCE_CODE_MIN = 4;
/** Maximum length of a code as typed (authoring and attendee input). */
export const ATTENDANCE_CODE_MAX = 100;

export function normalizeAttendanceCode(raw: string): string {
  return raw.normalize("NFKC").replace(/\s+/gu, "").toLowerCase();
}

/**
 * True when the attendee's typed code matches the authored one. An empty
 * normalised value never matches, so a blank answer can never earn a session
 * even if a malformed stored code were somehow empty too.
 */
export function codesMatch(typed: string, expected: string): boolean {
  const a = normalizeAttendanceCode(typed);
  return a.length > 0 && a === normalizeAttendanceCode(expected);
}

/**
 * Ids whose code collides (after normalisation) with another entry's code.
 * Attendance codes must be unique within an event, or one announced code
 * would earn the hours of a session the attendee never sat in. Shared by the
 * authoring action and the submitEvent gate.
 */
export function duplicateCodeIds(entries: readonly { id: string; code: string }[]): Set<string> {
  const byCode = new Map<string, string[]>();
  for (const e of entries) {
    const k = normalizeAttendanceCode(e.code);
    byCode.set(k, [...(byCode.get(k) ?? []), e.id]);
  }
  const dupes = new Set<string>();
  for (const ids of byCode.values()) if (ids.length > 1) ids.forEach((id) => dupes.add(id));
  return dupes;
}
