import { redirect } from "next/navigation";

/*
  Retired. Event-only events no longer use a single event-level quiz; each
  session is now a full course application (with its own quiz) captured in the
  sessions list. Any stale link here forwards to the sessions step.
*/
export default function RetiredEventQuizPage() {
  redirect("/company/events/new/sessions");
}
