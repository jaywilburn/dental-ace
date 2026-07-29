import "server-only";

/*
  Draft echo sanitizer.

  When a wizard step fails validation we persist the RAW submitted slice back
  into the draft JSONB so the step page can re-render exactly what the provider
  typed (see lib/forms/application/merge-step.ts). Before 2026-07-29 the failure
  path redirected without writing anything, so the page re-rendered from an
  empty draft and silently erased a whole screen of work.

  Persisting unvalidated input needs three guards, which is what this module is:

  1. SIZE. Raw input is unbounded (a paste can be megabytes). Clamp per string
     and per object so a bad paste can't bloat the row or the JSONB column.
  2. JSON SAFETY. NaN/Infinity stringify to `null`, which would land as SQL null
     under a field the readers type as `number`. Drop them instead so the field
     renders empty and the re-derived error says "required".
  3. SHAPE. Only plain JSON values survive. Anything exotic (Date, File,
     function, class instance) is dropped rather than serialized into the draft.

  This is a DRAFT-only convenience. Every submit path re-validates strictly
  before anything reaches PENDING, so an invalid echo can never be accredited.
*/

/** Per-string ceiling. The largest legitimate write cap is 20,000
 *  (courseOutline, detailedBioHtml); the extra headroom means a provider who
 *  went over always gets their text back to edit rather than a truncated stub. */
export const ECHO_MAX_STRING = 25_000;

/** Whole-slice ceiling. The biggest legitimate step slice is ~26,000 characters
 *  serialized, so this leaves generous room while still bounding the write. */
export const ECHO_MAX_TOTAL = 150_000;

/** Arrays in these slices are small and fixed (presenters <= 8, options 4,
 *  quiz 5). Anything longer is malformed input, not a real submission. */
const ECHO_MAX_ARRAY = 16;

/** presenters -> [i] -> field is the deepest legitimate shape. */
const ECHO_MAX_DEPTH = 3;

export type EchoResult = {
  /** The JSON-safe, size-clamped slice to merge into the draft. */
  value: Record<string, unknown>;
  /** True when something was cut. Callers surface this instead of truncating
   *  silently, which would be the same class of bug this module fixes. */
  truncated: boolean;
};

type Walk = { truncated: boolean };

function walkValue(value: unknown, depth: number, state: Walk): unknown {
  if (typeof value === "string") {
    if (value.length > ECHO_MAX_STRING) {
      state.truncated = true;
      return value.slice(0, ECHO_MAX_STRING);
    }
    return value;
  }
  if (typeof value === "number") {
    // NaN / Infinity would serialize to null under a `number` field.
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "boolean" || value === null) return value;

  if (Array.isArray(value)) {
    if (depth >= ECHO_MAX_DEPTH) return undefined;
    const out: unknown[] = [];
    for (const item of value.slice(0, ECHO_MAX_ARRAY)) {
      const walked = walkValue(item, depth + 1, state);
      // Keep positions stable: presenters[0] must stay presenters[0].
      out.push(walked === undefined ? null : walked);
    }
    if (value.length > ECHO_MAX_ARRAY) state.truncated = true;
    return out;
  }

  if (isPlainObject(value)) {
    if (depth >= ECHO_MAX_DEPTH) return undefined;
    return walkObject(value, depth + 1, state);
  }

  // undefined, functions, symbols, bigints, Dates, Files, class instances.
  return undefined;
}

/** Keys that would mutate the accumulator's prototype instead of becoming data.
 *  Reachable because raw input is attacker-controlled: JSON.parse turns
 *  {"__proto__": ...} into an own property, and `out.__proto__ = x` then hits
 *  Object.prototype's setter rather than adding a field. No wizard field is
 *  named any of these, so dropping them is free. */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function walkObject(
  input: Record<string, unknown>,
  depth: number,
  state: Walk,
): Record<string, unknown> {
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [key, raw] of Object.entries(input)) {
    if (UNSAFE_KEYS.has(key)) continue;
    const walked = walkValue(raw, depth, state);
    // Dropping the key (rather than writing null) preserves the "user cleared
    // this" semantics the JSONB merge already relies on.
    if (walked !== undefined) out[key] = walked;
  }
  // Hand back an ordinary object: callers spread it into a draft and Prisma
  // serializes it, and a null-prototype object is awkward for both.
  return { ...out };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Length of the longest top-level string field, and its key. */
function longestStringKey(obj: Record<string, unknown>): string | null {
  let best: string | null = null;
  let bestLen = 0;
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string" && value.length > bestLen) {
      best = key;
      bestLen = value.length;
    }
  }
  return best;
}

/**
 * Make a raw step slice safe to persist into a draft JSONB column.
 *
 * Returns the clamped value plus whether anything was cut, so the caller can
 * tell the provider what happened instead of silently losing their text.
 */
export function sanitizeEcho(raw: unknown): EchoResult {
  if (!isPlainObject(raw)) return { value: {}, truncated: false };

  const state: Walk = { truncated: false };
  const value = walkObject(raw, 0, state);

  // Shed the biggest fields until the whole slice fits. Bounded by the key
  // count, and each pass strictly shrinks the object.
  while (JSON.stringify(value).length > ECHO_MAX_TOTAL) {
    const key = longestStringKey(value);
    if (!key) break;
    delete value[key];
    state.truncated = true;
  }

  return { value, truncated: state.truncated };
}
