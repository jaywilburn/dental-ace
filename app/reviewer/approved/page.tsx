import Link from "next/link";
import { z } from "zod";
import { PageHeader } from "@/components/portal-shell";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { quizQuestionSchema } from "@/lib/forms/application/schemas";

/*
  Approved courses history for the REVIEWER role. Lists every accredited
  course with cert-issued count, quiz status, and review attribution. A
  STANDALONE course whose quiz_questions does not hold exactly 5 valid questions
  (all legacy-migrated courses started this way) has an unavailable attendee
  link; admins get a link to the post-approval quiz editor to fix it.

  Event courses that carry a SINGLE MC question (FULL_EVENT_QUIZ, eventId set,
  quiz is not a full 5-question set) are attended via the event link and their
  question is authored through the event, so they show as "Event session"
  (linking to the event) and are never routed to the standalone quiz editor.
  Event courses that DO hold a full 5-question quiz (legacy full-course events,
  incl. pre-July-2026 SELECTIVE_INLINE) keep the standard editable "5 questions"
  status, so the discriminator is quiz shape, not eventId alone.
*/

const quizArraySchema = z.array(quizQuestionSchema).length(5);

export default async function ReviewerApprovedPage() {
  const user = await requireStaff("REVIEWER");
  const isAdmin = user.staffRole === "ADMIN";
  // No row cap: this is the only staff-wide course list, and a silent cap
  // hid the oldest (all-legacy) courses once the catalog passed 100 rows.
  // Lightweight SELECTIVE_INLINE events mint NO AccreditedCourse rows, and
  // per-course events mint none either, so approving one made it vanish from
  // every staff list. Query events directly (they carry reviewedBy themselves).
  const approvedEvents = await prisma.event.findMany({
    where: { status: "APPROVED" },
    include: {
      company: { select: { name: true } },
      reviewedBy: { select: { email: true } },
      _count: { select: { sessions: true } },
    },
    orderBy: { approvedAt: "desc" },
  });

  const courses = await prisma.accreditedCourse.findMany({
    include: {
      company: { select: { name: true } },
      application: { select: { reviewedBy: { select: { email: true } } } },
    },
    orderBy: { approvedAt: "desc" },
  });

  return (
    <>
      <PageHeader
        title="Approved Courses"
        subtitle={`${courses.length} accredited course${courses.length === 1 ? "" : "s"} in the system`}
      />
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        {courses.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12px] text-text-muted">
            No approved courses yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2 font-semibold">Course ID</th>
                  <th className="px-4 py-2 font-semibold">Company</th>
                  <th className="px-4 py-2 font-semibold">Approved</th>
                  <th className="px-4 py-2 font-semibold">Expires</th>
                  <th className="px-4 py-2 text-right font-semibold">Certs Issued</th>
                  <th className="px-4 py-2 font-semibold">Quiz</th>
                  <th className="px-4 py-2 font-semibold">Reviewed By</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => {
                  const hasQuiz = quizArraySchema.safeParse(c.quizQuestions).success;
                  return (
                    <tr key={c.id} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-2 font-mono text-[11px] text-navy">
                        {c.courseIdNumber}
                      </td>
                      <td className="px-4 py-2 text-text-mid">{c.company.name}</td>
                      <td className="px-4 py-2 text-text-muted">
                        {c.approvedAt.toLocaleDateString("en-US", {
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-2 text-text-muted">
                        {c.expiresAt.toLocaleDateString("en-US", {
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-2 text-right text-text-mid tabular-nums">
                        {c.certsIssuedCount}
                      </td>
                      <td className="px-4 py-2">
                        {hasQuiz ? (
                          <span className="flex items-center gap-2 whitespace-nowrap">
                            <span className="text-text-muted">5 questions</span>
                            {isAdmin ? (
                              <Link
                                href={`/admin/courses/${c.id}/quiz`}
                                className="text-ace-dark underline"
                              >
                                Edit
                              </Link>
                            ) : null}
                          </span>
                        ) : c.eventId ? (
                          <Link
                            href={`/reviewer/events/${c.eventId}`}
                            className="whitespace-nowrap text-ace-dark underline"
                          >
                            Event session
                          </Link>
                        ) : (
                          <span className="flex items-center gap-2 whitespace-nowrap">
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                              Missing
                            </span>
                            {isAdmin ? (
                              <Link
                                href={`/admin/courses/${c.id}/quiz`}
                                className="text-ace-dark underline"
                              >
                                Add quiz
                              </Link>
                            ) : null}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-text-muted">
                        {c.application.reviewedBy?.email ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <h2 className="mb-2 mt-6 text-[13px] font-semibold text-navy">
        Approved Events ({approvedEvents.length})
      </h2>
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        {approvedEvents.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12px] text-text-muted">
            No approved events yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2 font-semibold">Event ID</th>
                  <th className="px-4 py-2 font-semibold">Company</th>
                  <th className="px-4 py-2 font-semibold">Event</th>
                  <th className="px-4 py-2 font-semibold">Hours</th>
                  <th className="px-4 py-2 font-semibold">Approved</th>
                  <th className="px-4 py-2 font-semibold">Certs</th>
                  <th className="px-4 py-2 font-semibold">Reviewer</th>
                  <th className="px-4 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {approvedEvents.map((ev) => (
                  <tr key={ev.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2 font-mono text-[11px] text-navy">
                      {ev.eventIdNumber ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-text-mid">{ev.company.name}</td>
                    <td className="px-4 py-2 font-medium text-navy">
                      {ev.name || "—"}
                      <span className="ml-1 font-normal text-text-muted">
                        · {ev._count.sessions} session
                        {ev._count.sessions === 1 ? "" : "s"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-text-muted">
                      {ev.totalHours ? Number(ev.totalHours).toFixed(1) : "—"}
                    </td>
                    <td className="px-4 py-2 text-text-muted">
                      {ev.approvedAt?.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      }) ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-text-muted">{ev.certsIssuedCount}</td>
                    <td className="px-4 py-2 text-text-muted">
                      {ev.reviewedBy?.email ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/reviewer/events/${ev.id}`}
                        className="whitespace-nowrap text-ace-dark underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
