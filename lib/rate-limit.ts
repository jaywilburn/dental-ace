/*
  Minimal in-memory fixed-window rate limiter. The clock is injectable for
  deterministic tests. Single-instance only; when the app runs on multiple
  serverless instances this must move to a shared store (e.g. Upstash). The
  attendee form, login, and application submit are the throttled surfaces.
*/

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitOptions = { limit: number; windowMs: number };
export type RateLimitResult = { ok: boolean; remaining: number; retryAfterMs: number };

export function rateLimit(
  key: string,
  opts: RateLimitOptions,
  now: number = Date.now(),
): RateLimitResult {
  const existing = buckets.get(key);
  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, remaining: opts.limit - 1, retryAfterMs: 0 };
  }
  if (existing.count >= opts.limit) {
    return { ok: false, remaining: 0, retryAfterMs: existing.resetAt - now };
  }
  existing.count += 1;
  return { ok: true, remaining: opts.limit - existing.count, retryAfterMs: 0 };
}

/** Test-only: clears all buckets between cases. */
export function __resetRateLimit(): void {
  buckets.clear();
}
