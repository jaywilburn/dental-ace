import { z } from "zod";
import { loadEventPageByToken, buildPublicForm, activeSurvey } from "@/lib/attend/event-quiz";
import { COURSE_FORMATS } from "@/lib/forms/application/schemas";
import { EventAttendeeForm } from "@/components/attend/event-attendee-form";
import { formatCeHours } from "@/lib/attend/format-ce-hours";

/*
  Public event attendee entry. Fails closed: invalid token or an
  unapproved/expired event shows a notice and no form. The quiz is assembled
  and stripped of answers server-side (lib/attend/event-quiz.ts).

  Certificates unavailable (the company has no cert balance, or the event has
  no certificate form): without an active survey this shows a notice and no
  form, exactly as before. With one, the survey still renders and every
  attendee takes the No-CE path (ceAvailable = false: survey, then name +
  email, submitEventSurveyOnly, which needs no cert balance).
*/
export const dynamic = "force-dynamic";

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="text-2xl font-bold tracking-tight">
        <span className="text-navy">Dental</span>
        <span className="text-ace">ACE</span>
      </p>
      <div className="mt-6 rounded-lg border border-border bg-white px-6 py-8">
        <h1 className="text-lg font-semibold text-navy">{title}</h1>
        <p className="mt-2 text-sm text-text-mid">{body}</p>
      </div>
      <p className="mt-6 text-xs text-text-muted">Questions? Contact info@dentalace.org</p>
    </main>
  );
}

export default async function AttendEventPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!z.guid().safeParse(token).success) {
    return <Notice title="Event not found" body="This certificate link is not valid." />;
  }

  const event = await loadEventPageByToken(token);
  if (!event || event.status !== "APPROVED") {
    return <Notice title="Event not found" body="This certificate link is not valid." />;
  }
  if (event.expiresAt === null || event.expiresAt < new Date()) {
    return <Notice title="Event expired" body="This event is no longer accepting certificate claims." />;
  }
  const survey = activeSurvey(event);
  const hasBalance = event.company.certBalance > 0;
  if (!hasBalance && !survey) {
    return (
      <Notice
        title="Certificates unavailable"
        body="The event host has run out of certificate credits. Please contact them to continue."
      />
    );
  }

  const form = hasBalance ? buildPublicForm(event) : null;
  if (!form && !survey) {
    return <Notice title="Event unavailable" body="This event is not configured for certificates yet." />;
  }
  const ceAvailable = form !== null;

  const totalHours = event.totalHours ? Number(event.totalHours) : 0;

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-900">{event.name}</h1>
      <p className="mt-1 text-sm text-slate-600">
        {/* With a survey first, the selective "select your sessions" line would
            mislead (the survey and the CE question come before any session). */}
        {!form
          ? "Answer a short survey from the event host."
          : form.mode === "full"
            ? formatCeHours(totalHours)
            : survey
              ? "Answer a short survey, then claim CE credit if you need it."
              : "Select the sessions you attended to claim your certificate"}
      </p>
      <EventAttendeeForm
        token={token}
        eventName={event.name}
        form={form}
        // False when no certificate can be claimed now (only reachable with an
        // active survey): the form skips the CE question and records the survey only.
        ceAvailable={ceAvailable}
        // Ungraded host survey (null when the company has surveys off or the
        // event has no questions); the submit action applies the same gate.
        survey={survey}
        // Events are delivered live; the attendee can still change this to the
        // format they actually attended in.
        courseFormatDefault={COURSE_FORMATS[0]}
      />
    </main>
  );
}
