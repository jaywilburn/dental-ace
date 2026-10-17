import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/portal-shell";
import { SurveyEditor } from "@/components/events/survey-editor";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { saveAdminEventSurvey } from "@/lib/events/survey-actions";
import { parseStoredSurvey } from "@/lib/events/survey-schemas";
import { surveyResponseCounts } from "@/lib/events/survey-response-counts";

/*
  ADMIN editor for an event's attendee survey, reached from the Event surveys
  section on /admin/companies/[id]. Same editor the provider sees on its
  event's Survey tab; saves here go through saveAdminEventSurvey, which writes
  an EVENT_SURVEY_UPDATED audit row. 404 when the event is not this company's,
  is still a draft, or the company has event surveys turned off.
*/

export default async function AdminEventSurveyPage({
  params,
}: {
  params: Promise<{ id: string; eventId: string }>;
}) {
  await requireStaff("ADMIN");
  const { id, eventId } = await params;

  // Both are UUID columns; a malformed id would make Prisma throw instead of
  // falling through to notFound().
  if (!z.guid().safeParse(id).success || !z.guid().safeParse(eventId).success) notFound();

  const event = await prisma.event.findFirst({
    where: { id: eventId, companyId: id },
    select: {
      id: true,
      name: true,
      eventIdNumber: true,
      eventDate: true,
      status: true,
      survey: true,
      company: { select: { id: true, name: true, surveyEnabled: true } },
    },
  });
  if (!event || event.status === "DRAFT" || !event.company.surveyEnabled) notFound();

  const responses = (await surveyResponseCounts([event.id])).get(event.id) ?? 0;
  const title = event.name || event.eventIdNumber || "Untitled event";

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-[11px] text-text-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/admin/companies" className="text-ace-dark underline">
              Companies
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link href={`/admin/companies/${event.company.id}#events`} className="text-ace-dark underline">
              {event.company.name}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li aria-current="page">Event survey</li>
        </ol>
      </nav>
      <PageHeader
        title={title}
        subtitle={[event.eventIdNumber, event.eventDate, "Attendee survey"].filter(Boolean).join(" · ")}
        action={
          <Link
            href={`/admin/companies/${event.company.id}#events`}
            className="whitespace-nowrap rounded-md border border-border bg-white px-3.5 py-2 text-[12px] font-semibold text-navy hover:bg-surface"
          >
            Back to {event.company.name}
          </Link>
        }
      />

      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-white p-5 text-[12px]">
          <p className="max-w-prose text-pretty text-text-mid">
            Optional and ungraded. Attendees see it on the event link after the quiz, and their answers
            never affect their score or credit hours. The provider can edit the same survey from its event
            page. Your saves are recorded in the audit log.
          </p>
          <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-text-mid">
              <span className="font-semibold text-navy tabular-nums">{responses}</span>{" "}
              {responses === 1 ? "attendee has" : "attendees have"} responded
            </p>
            <a
              href={`/api/admin/events/${event.id}/survey-export`}
              className="inline-flex min-h-9 items-center justify-center rounded-md border border-border bg-white px-3 text-[12px] font-semibold text-navy hover:bg-surface"
            >
              Download responses (CSV)
            </a>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-white p-5">
          <SurveyEditor
            eventId={event.id}
            initial={parseStoredSurvey(event.survey)}
            action={saveAdminEventSurvey}
          />
        </div>
      </div>
    </>
  );
}
