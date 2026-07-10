import { z } from "zod";
import { loadEventByToken, buildPublicForm } from "@/lib/attend/event-quiz";
import { COURSE_FORMATS } from "@/lib/forms/application/schemas";
import { EventAttendeeForm } from "@/components/attend/event-attendee-form";

/*
  Public event attendee entry. Fails closed: invalid token, unapproved/expired
  event, or a company with no cert balance shows a notice and no form. The quiz
  is assembled and stripped of answers server-side (lib/attend/event-quiz.ts).
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

  const event = await loadEventByToken(token);
  if (!event || event.status !== "APPROVED") {
    return <Notice title="Event not found" body="This certificate link is not valid." />;
  }
  if (event.expiresAt === null || event.expiresAt < new Date()) {
    return <Notice title="Event expired" body="This event is no longer accepting certificate claims." />;
  }
  if (event.company.certBalance <= 0) {
    return (
      <Notice
        title="Certificates unavailable"
        body="The event host has run out of certificate credits. Please contact them to continue."
      />
    );
  }

  const form = buildPublicForm(event);
  if (!form) {
    return <Notice title="Event unavailable" body="This event is not configured for certificates yet." />;
  }

  const totalHours = event.totalHours ? Number(event.totalHours) : 0;

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-900">{event.name}</h1>
      <p className="mt-1 text-sm text-slate-600">
        {form.mode === "full"
          ? `${totalHours.toFixed(1)} CE hours`
          : "Select the sessions you attended to claim your certificate"}
      </p>
      <EventAttendeeForm
        token={token}
        eventName={event.name}
        form={form}
        // Events are delivered live; the attendee can still change this to the
        // format they actually attended in.
        courseFormatDefault={COURSE_FORMATS[0]}
      />
    </main>
  );
}
