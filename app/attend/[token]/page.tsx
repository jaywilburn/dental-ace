import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { COURSE_FORMATS, quizQuestionSchema } from "@/lib/forms/application/schemas";
import { courseFormatLabel } from "@/lib/pdf/course-format-label";
import { AttendeeForm } from "@/components/attend/attendee-form";

/*
  Public attendee entry. Fails closed: an invalid token, an expired course, or
  a company with no remaining cert balance shows a friendly notice and no form.
*/

export const dynamic = "force-dynamic";

const quizArraySchema = z.array(quizQuestionSchema).length(5);

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
      <p className="mt-6 text-xs text-text-muted">
        Questions? Contact info@dentalace.org
      </p>
    </main>
  );
}

export default async function AttendPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // attendee_link_token is a UUID column; querying with a malformed token
  // makes Prisma throw (and the page crash) instead of falling through to
  // the not-found notice. Validate before touching the DB. z.guid() matches
  // lib/attend/schemas.ts (Zod v4's z.uuid() is stricter than our tokens).
  if (!z.guid().safeParse(token).success) {
    return <Notice title="Course not found" body="This certificate link is not valid." />;
  }

  const course = await prisma.accreditedCourse.findUnique({
    where: { attendeeLinkToken: token },
    select: {
      expiresAt: true,
      quizQuestions: true,
      company: { select: { certBalance: true } },
      application: { select: { courseTitle: true, ceHours: true, deliveryMethod: true } },
    },
  });

  if (!course) {
    return <Notice title="Course not found" body="This certificate link is not valid." />;
  }
  if (course.expiresAt < new Date()) {
    return <Notice title="Course expired" body="This course is no longer accepting certificate claims." />;
  }
  if (course.company.certBalance <= 0) {
    return (
      <Notice
        title="Certificates unavailable"
        body="The course provider has run out of certificate credits. Please contact them to continue."
      />
    );
  }

  const quiz = quizArraySchema.safeParse(course.quizQuestions);
  if (!quiz.success) {
    return <Notice title="Course unavailable" body="This course is not configured for certificates yet." />;
  }

  // Strip correct answers before sending the quiz to the client.
  const publicQuiz = quiz.data.map((q) =>
    q.type === "TF"
      ? { type: "TF" as const, question: q.question }
      : { type: "MC" as const, question: q.question, options: q.options },
  );

  // Pre-fill the attendee's Course Format from the course's declared format,
  // normalized to one of the four canonical options (legacy stored values fold
  // onto a canonical label; anything unrecognized defaults to the first option).
  const courseLabel = courseFormatLabel(course.application.deliveryMethod);
  const courseFormatDefault =
    courseLabel && (COURSE_FORMATS as readonly string[]).includes(courseLabel)
      ? (courseLabel as (typeof COURSE_FORMATS)[number])
      : COURSE_FORMATS[0];

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-900">
        {course.application.courseTitle ?? "Claim your certificate"}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {Number(course.application.ceHours ?? 0).toFixed(1)} CE hours
      </p>
      <AttendeeForm
        token={token}
        quiz={publicQuiz}
        courseFormatDefault={courseFormatDefault}
      />
    </main>
  );
}
