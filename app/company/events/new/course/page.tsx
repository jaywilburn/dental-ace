import { redirect } from "next/navigation";

/*
  Retired (July 2026). SELECTIVE_INLINE no longer collects an event-level
  application; each session carries its own full application through the
  per-session mini-wizard (inline-sessions/[sessionId]/...). This stub keeps any
  in-flight draft or bookmark from 404ing by sending it to the Sessions step.
*/
export default function RetiredEventCoursePage() {
  redirect("/company/events/new/sessions");
}
