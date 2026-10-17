import "server-only";
import { headers } from "next/headers";
import { rateLimit, type RateLimitResult } from "@/lib/rate-limit";

/*
  The public event attendee link's throttle: 5 submissions per IP per event
  link per 10 minutes. ONE bucket shared by the certificate submit
  (submitEventAttendance) and the No-CE survey submit (submitEventSurveyOnly),
  so alternating between the two cannot double the budget.
*/
export async function eventAttendRateLimit(token: string): Promise<RateLimitResult> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  return rateLimit(`attend-event:${ip}:${token}`, { limit: 5, windowMs: 10 * 60 * 1000 });
}
