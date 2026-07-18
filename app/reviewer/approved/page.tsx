import Link from "next/link";
import { z } from "zod";
import { PageHeader } from "@/components/portal-shell";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { quizQuestionSchema } from "@/lib/forms/application/schemas";

/*
  Approved courses history for the REVIEWER role. Lists every accredited
  course with cert-issued count, quiz status, and review attribution. A course
  whose quiz_questions does not hold exactly 5 valid questions (all legacy-
  migrated courses started this way) has an unavailable attendee link; admins
  get a link to the post-approval quiz editor to fix it.
*/

const quizArraySchema = z.array(quizQuestionSchema).length(5);

export default async function ReviewerApprovedPage() {
  const user = await requireStaff("REVIEWER");
  const isAdmin = user.staffRole === "ADMIN";
  // No row cap: this is the only staff-wide course list, and a silent cap
  // hid the oldest (all-legacy) courses once the catalog passed 100 rows.
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
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        {hasQuiz ? (
                          <span className="text-text-muted">5 questions</span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                            Missing
                          </span>
                        )}
                        {isAdmin ? (
                          <Link
                            href={`/admin/courses/${c.id}/quiz`}
                            className="text-ace underline"
                          >
                            {hasQuiz ? "Edit" : "Add quiz"}
                          </Link>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-text-muted">
                      {c.application.reviewedBy?.email ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
