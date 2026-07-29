import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { FormNav } from "@/components/application-form/form-controls";
import { StepErrors } from "@/components/application-form/field-errors";
import { deriveStepErrors } from "@/lib/forms/field-errors";
import { sessionCourseInfoSchema } from "@/lib/forms/event/schemas";
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
  searchParams: Promise<{ error?: string }>;
}) {
  await requireDentalAce();
  const { sessionId } = await params;
  const { error } = await searchParams;
  const session = await getInlineSession(sessionId);
  if (!session) redirect("/company/events/new/sessions");

  // Errors are re-derived from the draft the failing action just echoed back,
  // so they always line up with what is rendered below. Nothing is stored or
  // passed through the URL, and a stale ?error= over a fixed draft yields none.
  const errors = error === "validation" ? deriveStepErrors(sessionCourseInfoSchema, session.data) : {};
  return (
    <>
      <PageHeader title="Event Session" subtitle="Step 1 of 4 — Course Information" />
      <StepErrors error={error} errors={errors} />
      <form action={saveInlineSessionCourse} className="space-y-5">
        <input type="hidden" name="sessionId" value={session.id} />
        <CourseFields draft={session.data} errors={errors} />
        <FormNav
          back={{ href: "/company/events/new/sessions", label: "Back to sessions" }}
          nextLabel="Next: Creator"
        />
      </form>
    </>
  );
}
