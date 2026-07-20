import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { FormErrorBanner, FormNav } from "@/components/application-form/form-controls";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { ensureEventDraft, getEventDraft, saveAttachedCourses } from "@/lib/events/event-actions";
import { isInlineFullCourse } from "@/lib/forms/event/schemas";

/*
  Event wizard (Opt 2/4, PER_COURSE) — attach already-approved courses as the
  event's sessions. Each attached course keeps its own accreditation/assets;
  the event certificate covers them together. Reachable only for PER_COURSE types.
*/
export default async function EventCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  const user = await requireDentalAce();
  const { error, detail } = await searchParams;
  const eventId = await ensureEventDraft();
  const draft = await getEventDraft(eventId);
  if (!draft?.eventType) redirect("/company/events/new/qualifiers");
  // Event-only types capture full-course sessions inline, not attached courses.
  if (isInlineFullCourse(draft.eventType)) redirect("/company/events/new/sessions");

  const courses = await prisma.accreditedCourse.findMany({
    // eventId:null keeps event-scoped session courses out of the attach picker.
    where: { companyId: user.companyId!, supersededAt: null, eventId: null },
    orderBy: { approvedAt: "desc" },
    select: {
      id: true,
      courseIdNumber: true,
      application: { select: { courseTitle: true, ceHours: true } },
    },
  });
  const attached = new Set(draft.sessions.map((s) => s.courseId).filter(Boolean) as string[]);
  const selective = draft.eventType === "SELECTIVE_PER_COURSE";

  return (
    <>
      <PageHeader title="New Event" subtitle="Step 3 of 4 — Attach Courses" />
      {error === "validation" ? <FormErrorBanner detail={detail} /> : null}
      <div className="mb-4 rounded-md border border-ver bg-ver-bg p-3 text-[12px] text-ver-dark text-pretty">
        Select the approved courses that make up this event.{" "}
        {selective
          ? "Attendees will pick which of these they attended and answer one question per attended course."
          : "Attendees receive one certificate covering all attached courses, answering one question per course."}
      </div>
      <form action={saveAttachedCourses} className="space-y-4">
        <input type="hidden" name="eventId" value={eventId} />
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          {courses.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12px] text-text-muted text-pretty">
              You have no approved courses yet. Submit and get a course approved
              first, then attach it here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                    <th className="px-4 py-2 font-semibold">Attach</th>
                    <th className="px-4 py-2 font-semibold">Course ID</th>
                    <th className="px-4 py-2 font-semibold">Title</th>
                    <th className="px-4 py-2 text-right font-semibold">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {courses.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-2">
                        <input type="checkbox" name="courseIds" value={c.id} defaultChecked={attached.has(c.id)} />
                      </td>
                      <td className="px-4 py-2 font-mono text-[11px] text-navy">{c.courseIdNumber}</td>
                      <td className="px-4 py-2 font-medium text-navy">
                        {c.application.courseTitle ?? "(untitled)"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-text-mid">
                        {c.application.ceHours ? Number(c.application.ceHours).toFixed(1) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <FormNav back={{ href: "/company/events/new/qualifiers", label: "Back" }} nextLabel="Next: Review" />
      </form>
    </>
  );
}
