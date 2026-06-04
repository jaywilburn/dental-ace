import "server-only";

/*
  In-process sliding-window rate limit for the public /verify lookup.

  Defaults: 30 requests per IP per hour. Counts are kept in a Map and pruned
  on every check; this is fine for a single Node process. When we move behind
  a load balancer (multi-instance) or under sustained traffic, swap the store
  for Redis (Upstash @upstash/ratelimit) — the call shape stays the same.

  Trust model for the client IP:
   - Prefer platform-set headers that the client cannot forge:
     Cloudflare's `cf-connecting-ip` and Vercel's `x-vercel-forwarded-for`.
   - Fall back to the LAST token of `x-forwarded-for` (the entry the closest
     trusted proxy wrote, assuming a single proxy hop — the common Vercel /
     Netlify / Cloudflare setup). The FIRST token is the client's own claim
     and is fully spoofable.
   - All candidates are validated with a strict IPv4/IPv6 regex; non-IPs are
     ignored. If nothing parses, the request falls into a single shared
     "unknown" bucket so spoofers can't fan out across infinite keys.
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

// Permissive enough for IPv4 dotted-quad and IPv6 (including IPv4-mapped v6),
// strict enough to reject "1.2.3.4; rm -rf /" or random non-IP strings.
const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const IPV6_RE = /^[0-9a-f:]+(?:\.\d+){0,3}$/i;

function isValidIp(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (IPV4_RE.test(v)) return true;
  if (v.length <= 45 && IPV6_RE.test(v) && v.includes(":")) return true;
  return false;
}

export function rateLimitKeyFromHeaders(headers: Headers): string {
  // Platform-set headers (proxy writes these; client can't forge them).
  const cf = headers.get("cf-connecting-ip");
  if (cf && isValidIp(cf)) return cf;
  const vercel = headers.get("x-vercel-forwarded-for");
  if (vercel) {
    const first = vercel.split(",")[0]!.trim();
    if (isValidIp(first)) return first;
  }
  // Best-effort fallback: take the LAST hop of XFF (typically what the closest
  // trusted proxy stamped). The first token is the client's own claim and is
  // attacker-controlled — never use it.
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const tokens = xff.split(",").map((t) => t.trim()).filter(Boolean);
    const last = tokens.at(-1);
    if (last && isValidIp(last)) return last;
  }
  const real = headers.get("x-real-ip");
  if (real && isValidIp(real)) return real;
  // No trustworthy IP — share one bucket across all anonymous requests so a
  // spoofer can't get a free bucket per forged value.
  return "unknown";
}
