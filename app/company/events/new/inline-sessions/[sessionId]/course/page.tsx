import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { FormErrorBanner, FormNav } from "@/components/application-form/form-controls";
import { CourseFields } from "@/components/application-form/steps/course-fields";
import { requireDentalAce } from "@/lib/auth/session";
import { getInlineSession } from "@/lib/events/inline-session-data";
import { saveInlineSessionCourse } from "@/lib/events/inline-session-actions";

/*
  SELECTIVE_INLINE per-session mini-wizard, Step 1 — Course Information. Reuses
  the shared <CourseFields> (default 20k "Course Outline"; there is no event-wide
  outline). Posts to the event-session-scoped saveInlineSessionCourse action.
*/
export default async function InlineSessionCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  await requireDentalAce();
  const { sessionId } = await params;
  const { error, detail } = await searchParams;
  const session = await getInlineSession(sessionId);
  if (!session) redirect("/company/events/new/sessions");

  return (
    <>
      <PageHeader title="Event Session" subtitle="Step 1 of 4 — Course Information" />
      {error === "validation" ? <FormErrorBanner detail={detail} /> : null}
      <form action={saveInlineSessionCourse} className="space-y-5">
        <input type="hidden" name="sessionId" value={session.id} />
        <CourseFields draft={session.data} />
        <FormNav
          back={{ href: "/company/events/new/sessions", label: "Back to sessions" }}
          nextLabel="Next: Creator"
        />
      </form>
    </>
  );
}
