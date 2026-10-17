import "server-only";
import { headers } from "next/headers";
import { rateLimit, type RateLimitResult } from "@/lib/rate-limit";

/*
  The public event attendee link's throttles: 5 submissions per IP per event
  link per 10 minutes, in TWO separate buckets with the same window and limit.
  The certificate submit (submitEventAttendance) uses the base key; the No-CE
  survey submit (submitEventSurveyOnly) uses the same key with a ":survey"
  suffix, so No-CE traffic (a whole room on one venue IP, or a spammer) never
  consumes an attendee's certificate attempts budget.
*/
const EVENT_ATTEND_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 } as const;

export type EventAttendBucket = "certificate" | "survey";

/** The limiter key for one bucket. PURE, exported for tests. */
export function eventAttendRateLimitKey(ip: string, token: string, bucket: EventAttendBucket): string {
  const base = `attend-event:${ip}:${token}`;
  return bucket === "survey" ? `${base}:survey` : base;
}

export async function eventAttendRateLimit(
  token: string,
  bucket: EventAttendBucket = "certificate",
): Promise<RateLimitResult> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  return rateLimit(eventAttendRateLimitKey(ip, token, bucket), EVENT_ATTEND_LIMIT);
}
