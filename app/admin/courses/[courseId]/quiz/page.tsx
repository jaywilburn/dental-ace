import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/portal-shell";
import { QuizFields } from "@/components/application-form/steps/quiz-fields";
import { QuizPreviewCard } from "@/components/application-form/detail-section";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { quizQuestionSchema } from "@/lib/forms/application/schemas";
import { saveCourseQuiz } from "@/lib/admin/course-quiz";

/*
  ADMIN-only editor for the 5-question certificate quiz on an already-approved
  course. Exists because legacy-migrated courses arrived with an empty quiz,
  which keeps their public attendee link unavailable ("not configured for
  certificates"). Reached from the Quiz column on /reviewer/approved.
*/

const quizArraySchema = z.array(quizQuestionSchema).length(5);

export default async function AdminCourseQuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireStaff("ADMIN");
  const { courseId } = await params;
  const { ok, error } = await searchParams;

  // The PK is a UUID column; a malformed id would make Prisma throw instead of
  // falling through to notFound(). Validate before touching the DB.
  if (!z.guid().safeParse(courseId).success) notFound();

  const course = await prisma.accreditedCourse.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      courseIdNumber: true,
      approvedAt: true,
      expiresAt: true,
      quizQuestions: true,
      attendeeLinkToken: true,
      eventId: true,
      company: { select: { name: true } },
      application: { select: { courseTitle: true, ceHours: true } },
    },
  });
  if (!course) notFound();

  const saved = quizArraySchema.safeParse(course.quizQuestions);
  const title = course.application.courseTitle ?? `Course ${course.courseIdNumber}`;
  const dateFmt = { month: "short", day: "numeric", year: "numeric" } as const;

  // Event-session courses (FULL_EVENT_QUIZ) carry a single MC question authored
  // through the event, not a standalone 5-question quiz. This legacy-course
  // editor validates + saves exactly 5 questions, so it must refuse event
  // sessions (a save here would overwrite the single question with five).
  if (course.eventId) {
    return (
      <>
        <PageHeader
          title="Certificate Quiz"
          subtitle={`${course.courseIdNumber} · ${title}`}
          action={
            <Link
              href="/reviewer/approved"
              className="rounded-md border border-border bg-white px-3.5 py-2 text-[12px] font-semibold text-navy hover:bg-surface"
            >
              Back to Approved Courses
            </Link>
          }
        />
        <div className="rounded-md border border-border bg-surface px-4 py-3 text-[13px] text-text-muted">
          This course is a session of an event. Its attendee question is set when
          the event is created and is not edited here.
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Certificate Quiz"
        subtitle={`${course.courseIdNumber} · ${title}`}
        action={
          <Link
            href="/reviewer/approved"
            className="rounded-md border border-border bg-white px-3.5 py-2 text-[12px] font-semibold text-navy hover:bg-surface"
          >
            Back to Approved Courses
          </Link>
        }
      />

      {ok === "saved" ? (
        <div className="mb-4 rounded-md border border-emerald-400 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-700">
          Quiz saved. The attendee link now serves these questions.
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-md border border-red-400 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mb-5 rounded-lg border border-border bg-white p-4">
        <div className="grid gap-2 text-[12px] text-text-mid sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-text-muted">Company</p>
            <p>{course.company.name}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-text-muted">CE Hours</p>
            <p className="tabular-nums">{Number(course.application.ceHours ?? 0).toFixed(1)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-text-muted">Approved</p>
            <p>{course.approvedAt.toLocaleDateString("en-US", dateFmt)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-text-muted">Expires</p>
            <p>{course.expiresAt.toLocaleDateString("en-US", dateFmt)}</p>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-text-muted">
          Attendee link:{" "}
          <a
            href={`/attend/${course.attendeeLinkToken}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ace-dark underline"
          >
            /attend/{course.attendeeLinkToken}
          </a>
        </p>
      </div>

      {saved.success ? (
        <div className="mb-5">
          <QuizPreviewCard title="Saved quiz (currently live on the attendee link)" quiz={saved.data} />
        </div>
      ) : (
        <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-800">
          This course has no certificate quiz yet. Its public attendee link stays
          unavailable until a 5-question quiz is saved.
        </div>
      )}

      <h2 className="mb-3 text-[13px] font-semibold text-navy">
        {saved.success ? "Edit quiz" : "Add quiz"}
      </h2>
      <form action={saveCourseQuiz} className="space-y-4">
        <input type="hidden" name="courseId" value={course.id} />
        <QuizFields draft={{ quiz: saved.success ? saved.data : undefined }} />
        <button
          type="submit"
          className="rounded-md bg-navy px-3.5 py-2 text-[12px] font-semibold text-white hover:bg-navy/90"
        >
          Save Quiz
        </button>
      </form>
    </>
  );
}
