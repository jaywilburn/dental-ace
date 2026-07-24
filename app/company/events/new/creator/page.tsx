import { redirect } from "next/navigation";

/*
  Retired (July 2026). SELECTIVE_INLINE no longer collects an event-level
  application; each session carries its own creator through the per-session
  mini-wizard. This stub redirects any in-flight draft or bookmark to Sessions.
*/
export default function RetiredEventCreatorPage() {
  redirect("/company/events/new/sessions");
}
