import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { FormErrorBanner, FormNav } from "@/components/application-form/form-controls";
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
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  await requireDentalAce();
  const { sessionAppId } = await params;
  const { error, detail } = await searchParams;
  const app = await getSessionApp(sessionAppId);
  if (!app) redirect("/company/events/new/sessions");

  return (
    <>
      <PageHeader title="Event Session" subtitle="Step 1 of 4 — Course Information" />
      {error === "validation" ? <FormErrorBanner detail={detail} /> : null}
      <form action={saveSessionCourse} className="space-y-5">
        <input type="hidden" name="sessionAppId" value={app.id} />
        <CourseFields draft={app.data} />
        <FormNav
          back={{ href: "/company/events/new/sessions", label: "Back to sessions" }}
          nextLabel="Next: Creator"
        />
      </form>
    </>
  );
}
