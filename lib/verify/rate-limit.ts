import "server-only";

/*
  In-process sliding-window rate limit for the public /verify lookup.

  Defaults: 30 requests per IP per hour. Counts are kept in a Map and pruned
  on every check; this is fine for a single Node process. When we move behind
  a load balancer (multi-instance) or under sustained traffic, swap the store
  for Redis (Upstash @upstash/ratelimit) — the call shape stays the same.
*/

const LIMIT = Number(process.env.VERIFY_RATE_LIMIT ?? 30);
const WINDOW_MS = 60 * 60 * 1000;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: Date;
};

export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  // Opportunistic prune to keep the map bounded under abuse.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.resetAt <= now) buckets.delete(k);
    }
  }
  return {
    ok: bucket.count <= LIMIT,
    remaining: Math.max(0, LIMIT - bucket.count),
    resetAt: new Date(bucket.resetAt),
  };
}

export function rateLimitKeyFromHeaders(
  headers: Headers,
  fallback = "anonymous",
): string {
  // x-forwarded-for is "client, proxy1, proxy2"; the first is the original client.
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? fallback;
}
