import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { FormNav } from "@/components/application-form/form-controls";
import { StepErrors } from "@/components/application-form/field-errors";
import { deriveStepErrors } from "@/lib/forms/field-errors";
import { step1Schema } from "@/lib/forms/application/schemas";
import { CourseFields } from "@/components/application-form/steps/course-fields";
import { requireDentalAce } from "@/lib/auth/session";
import { getSessionApp } from "@/lib/events/session-data";
import { saveSessionCourse } from "@/lib/events/session-actions";

/*
  Inline event-session sub-wizard, Step 1 — Course Information. Reuses the shared
  <CourseFields> from the standalone application wizard; posts to the event-scoped
  saveSessionCourse action.
*/
export default async function SessionCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionAppId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireDentalAce();
  const { sessionAppId } = await params;
  const { error } = await searchParams;
  const app = await getSessionApp(sessionAppId);
  if (!app) redirect("/company/events/new/sessions");

  // Errors are re-derived from the draft the failing action just echoed back,
  // so they always line up with what is rendered below. Nothing is stored or
  // passed through the URL, and a stale ?error= over a fixed draft yields none.
  const errors = error === "validation" ? deriveStepErrors(step1Schema, app.data) : {};
  return (
    <>
      <PageHeader title="Event Session" subtitle="Step 1 of 4 — Course Information" />
      <StepErrors error={error} errors={errors} />
      <form action={saveSessionCourse} className="space-y-5">
        <input type="hidden" name="sessionAppId" value={app.id} />
        <CourseFields draft={app.data} errors={errors} />
        <FormNav
          back={{ href: "/company/events/new/sessions", label: "Back to sessions" }}
          nextLabel="Next: Creator"
        />
      </form>
    </>
  );
}
