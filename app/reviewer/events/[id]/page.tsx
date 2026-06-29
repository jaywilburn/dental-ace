import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { approveEvent, rejectEvent } from "@/lib/reviewer/event-actions";
import type { EventType } from "@prisma/client";

const TYPE_LABEL: Record<EventType, string> = {
  FULL_EVENT_QUIZ: "Full attendance · single use (one event application)",
  FULL_PER_COURSE: "Full attendance · courses reused",
  SELECTIVE_INLINE: "Selective attendance · single use (inline sessions)",
  SELECTIVE_PER_COURSE: "Selective attendance · courses reused",
};

type StoredQuestion = { question?: string; options?: string[]; correctIndex?: number };
type QuizItem =
  | { type: "TF"; question: string; correctAnswer: "True" | "False" }
  | { type: "MC"; question: string; options: string[]; correctIndex: number };

/*
  Reviewer event detail. Shows the submitted event, its sessions/quiz, and the
  approve/reject actions (lib/reviewer/event-actions.ts).
*/
export default async function ReviewEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireStaff("REVIEWER");
  const { id } = await params;
  const { error } = await searchParams;

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      company: { select: { name: true } },
      sessions: {
        orderBy: { position: "asc" },
        include: {
          course: { select: { courseIdNumber: true, application: { select: { courseTitle: true, ceHours: true } } } },
        },
      },
    },
  });
  if (!event) notFound();

  const data = (event.eventData as Record<string, unknown>) ?? {};
  const quiz = (data.quiz as QuizItem[] | undefined) ?? [];
  const pending = event.status === "PENDING";

  return (
    <>
      <PageHeader
        title={`Review Event — ${event.name}`}
        subtitle={`${event.company.name} · ${event.eventDate}`}
        action={
          <Link href="/reviewer" className="rounded-md border border-border bg-white px-3 py-1.5 text-[11px] font-semibold text-navy hover:bg-surface">
            ← Back to Queue
          </Link>
        }
      />

      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-white p-5 text-[12px]">
          <dl className="space-y-1.5">
            <Row label="Status" value={event.status} />
            <Row label="Type" value={event.eventType ? TYPE_LABEL[event.eventType] : "—"} />
            <Row label="Total hours" value={event.totalHours ? Number(event.totalHours).toFixed(1) : "—"} />
            <Row label="Organization" value={String(data.organizationName ?? "—")} />
            <Row label="Administrator" value={`${String(data.adminName ?? "—")} · ${String(data.adminEmail ?? "")}`} />
            {event.eventIdNumber ? <Row label="Event ID" value={event.eventIdNumber} /> : null}
          </dl>
        </div>

        {event.eventType === "SELECTIVE_INLINE" ? (
          <div className="rounded-lg border border-border bg-white p-5">
            <p className="mb-3 text-[13px] font-semibold text-navy">Sessions</p>
            <ul className="space-y-3">
              {event.sessions.map((s) => {
                const q = (s.question as StoredQuestion | null) ?? {};
                return (
                  <li key={s.id} className="rounded-md border border-border p-3 text-[12px]">
                    <p className="font-semibold text-navy">
                      {s.name} <span className="font-normal text-text-muted">· {s.durationHours ? Number(s.durationHours).toFixed(1) : "?"} hrs</span>
                    </p>
                    <p className="mt-1 text-text-mid">{q.question}</p>
                    <ol className="mt-1 list-inside list-decimal text-text-muted">
                      {(q.options ?? []).map((opt, i) => (
                        <li key={i} className={i === q.correctIndex ? "font-semibold text-green-700" : ""}>
                          {opt}{i === q.correctIndex ? " ✓" : ""}
                        </li>
                      ))}
                    </ol>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : event.eventType !== "FULL_EVENT_QUIZ" ? (
          <div className="rounded-lg border border-border bg-white p-5">
            <p className="mb-3 text-[13px] font-semibold text-navy">Attached courses</p>
            <ul className="space-y-1 text-[12px]">
              {event.sessions.map((s) => (
                <li key={s.id} className="flex justify-between gap-4">
                  <span className="text-text-mid">{s.course?.application.courseTitle ?? "(course)"}</span>
                  <span className="font-mono text-[11px] text-text-muted">{s.course?.courseIdNumber}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-white p-5">
            <p className="mb-3 text-[13px] font-semibold text-navy">Event Quiz</p>
            <ol className="space-y-3 text-[12px]">
              {quiz.map((q, i) => (
                <li key={i}>
                  <p className="font-semibold text-navy">Q{i + 1}. {q.question}</p>
                  {q.type === "TF" ? (
                    <p className="text-text-muted">Correct: <span className="font-semibold text-green-700">{q.correctAnswer}</span></p>
                  ) : (
                    <ol className="list-inside list-decimal text-text-muted">
                      {q.options.map((opt, j) => (
                        <li key={j} className={j === q.correctIndex ? "font-semibold text-green-700" : ""}>
                          {opt}{j === q.correctIndex ? " ✓" : ""}
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}

        {pending ? (
          <div className="grid gap-4 md:grid-cols-2">
            <form action={approveEvent} className="rounded-lg border border-green-300 bg-green-50/40 p-4">
              <input type="hidden" name="eventId" value={event.id} />
              <p className="mb-2 text-[13px] font-semibold text-navy">Approve</p>
              <textarea
                name="reviewerNotes"
                placeholder="Optional notes"
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-[12px]"
                rows={2}
              />
              <button type="submit" className="mt-2 w-full rounded-md bg-green-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-green-800">
                Approve event
              </button>
            </form>
            <form action={rejectEvent} className="rounded-lg border border-red-300 bg-red-50/40 p-4">
              <input type="hidden" name="eventId" value={event.id} />
              <p className="mb-2 text-[13px] font-semibold text-navy">Reject</p>
              {error === "reason_required" ? (
                <p className="mb-1 text-[11px] text-red-600">Please give a reason (at least 10 characters).</p>
              ) : null}
              <textarea
                name="reason"
                placeholder="Reason for rejection (sent to the company)"
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-[12px]"
                rows={2}
                required
              />
              <button type="submit" className="mt-2 w-full rounded-md bg-red-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-red-800">
                Reject event
              </button>
            </form>
          </div>
        ) : (
          <div className="rounded-md border border-border bg-surface px-4 py-3 text-[12px] text-text-muted">
            This event is {event.status.toLowerCase()}.{event.reviewerNotes ? ` Notes: ${event.reviewerNotes}` : ""}
          </div>
        )}
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-right font-medium text-navy">{value}</dd>
    </div>
  );
}
