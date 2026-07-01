import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { courseAssetUrls } from "@/lib/courses/course-assets";
import { startCourseRenewal } from "@/lib/company/course-renewal";

// Renewal becomes available this many days before a course expires (and stays
// available after expiry). Reminder emails fire at 60/30 days.
const RENEW_WINDOW_DAYS = 90;

const RENEW_ERRORS: Record<string, string> = {
  renew_not_found: "That course could not be found.",
  already_renewed: "That course has already been renewed.",
  renewal_in_progress: "A renewal for that course is already in progress.",
  renew_failed: "Could not start the renewal. Please try again.",
};

/*
  My Courses — lists every application + accredited course for the company.
  Pending applications show their submitted timestamp; approved courses show
  Course ID, title, expiry, cert-issued count, and the four deliverables:
  Course ID, attendee link, QR code, and approval letter (QR + letter via
  short-lived signed URLs from the uploads bucket; if the recorded object is
  missing because the post-approval upload failed, courseAssetUrls regenerates
  it on demand). The attendee link is same-origin, so it is rendered as a
  relative href and never depends on env configuration.
*/

export default async function MyCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ just?: string; error?: string }>;
}) {
  const user = await requireDentalAce();
  const { just, error } = await searchParams;

  if (!user.companyId) {
    return (
      <PageHeader title="My Courses" subtitle="No company is linked to your account." />
    );
  }

  const [applications, accreditedCourses] = await Promise.all([
    prisma.courseApplication.findMany({
      where: {
        companyId: user.companyId,
        status: { in: ["PENDING", "REJECTED"] },
        // Exclude inline event-scoped session applications (event-only path).
        eventId: null,
      },
      orderBy: { submittedAt: "desc" },
      take: 50,
    }),
    prisma.accreditedCourse.findMany({
      // eventId:null hides event-scoped session courses from the reusable list.
      where: { companyId: user.companyId, eventId: null },
      orderBy: { approvedAt: "desc" },
      take: 50,
      include: {
        application: { select: { courseTitle: true, ceHours: true } },
        company: { select: { name: true } },
      },
    }),
  ]);

  // Signed download URLs expire after 5 minutes; a missing object behind a
  // recorded path is regenerated on demand. A null means the asset path was
  // never recorded (pre-feature course) or regeneration failed (logged).
  const courses = await Promise.all(
    accreditedCourses.map(async (course) => ({
      ...course,
      attendeeUrl: `/attend/${course.attendeeLinkToken}`,
      ...(await courseAssetUrls({
        attendeeLinkToken: course.attendeeLinkToken,
        qrCodeUrl: course.qrCodeUrl,
        approvalLetterUrl: course.approvalLetterUrl,
        courseIdNumber: course.courseIdNumber,
        approvedAt: course.approvedAt,
        expiresAt: course.expiresAt,
        companyName: course.company.name,
        courseTitle:
          course.application.courseTitle ?? `Course ${course.courseIdNumber}`,
        ceHours: Number(course.application.ceHours ?? 0),
      })),
    })),
  );

  // Courses with a renewal already in flight (DRAFT or PENDING) can't be
  // renewed again; surface that instead of the Renew button.
  const courseIds = accreditedCourses.map((c) => c.id);
  const openRenewals = courseIds.length
    ? await prisma.courseApplication.findMany({
        where: {
          companyId: user.companyId,
          renewalOfCourseId: { in: courseIds },
          status: { in: ["PENDING", "DRAFT"] },
        },
        select: { renewalOfCourseId: true },
      })
    : [];
  const renewingCourseIds = new Set(
    openRenewals.map((r) => r.renewalOfCourseId),
  );
  const now = new Date();

  return (
    <>
      <PageHeader
        title="My Courses"
        subtitle={`${accreditedCourses.length} approved · ${applications.filter((a) => a.status === "PENDING").length} pending`}
        action={
          <Link
            href="/company/applications/new"
            className="rounded-md bg-navy px-3.5 py-2 text-[12px] font-semibold text-white hover:bg-navy/90"
          >
            + New Application
          </Link>
        }
      />

      {just === "submitted" ? (
        <div className="mb-4 rounded-md border border-emerald-400 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-700">
          ✓ Application submitted. AADB has been notified and will review shortly.
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          {RENEW_ERRORS[error] ?? "Something went wrong. Please try again."}
        </div>
      ) : null}

      <h2 className="mb-3 text-[13px] font-semibold text-navy">Accredited courses</h2>
      <div className="mb-6 overflow-hidden rounded-lg border border-border bg-white">
        {accreditedCourses.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-text-muted">
            No accredited courses yet.
          </p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2 font-semibold">Course ID</th>
                <th className="px-4 py-2 font-semibold">Course Name</th>
                <th className="px-4 py-2 font-semibold">Approved</th>
                <th className="px-4 py-2 font-semibold">Expires</th>
                <th className="px-4 py-2 text-right font-semibold">Certs Issued</th>
                <th className="px-4 py-2 font-semibold">Deliverables</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => {
                const isSuperseded = course.supersededAt != null;
                const daysToExpiry = Math.ceil(
                  (course.expiresAt.getTime() - now.getTime()) / 86_400_000,
                );
                const renewable =
                  !isSuperseded && daysToExpiry <= RENEW_WINDOW_DAYS;
                const renewalInProgress = renewingCourseIds.has(course.id);
                return (
                <tr key={course.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2 font-mono text-[11px] text-navy">
                    {course.courseIdNumber}
                  </td>
                  <td className="px-4 py-2 font-medium text-navy">
                    {course.application.courseTitle ?? `Course #${course.id.slice(0, 8)}`}
                  </td>
                  <td className="px-4 py-2 text-text-muted">
                    {course.approvedAt.toLocaleDateString("en-US", {
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-2 text-text-muted">
                    {course.expiresAt.toLocaleDateString("en-US", {
                      month: "short",
                      year: "numeric",
                    })}
                    {isSuperseded ? (
                      <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                        · Renewed
                      </span>
                    ) : daysToExpiry < 0 ? (
                      <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-red-600">
                        · Expired
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-right text-text-mid tabular-nums">
                    {course.certsIssuedCount}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 whitespace-nowrap">
                      <a
                        href={course.attendeeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-ace underline"
                      >
                        Attendee Link
                      </a>
                      {course.qrDownloadUrl ? (
                        <a
                          href={course.qrDownloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-ace underline"
                        >
                          QR Code
                        </a>
                      ) : (
                        <span className="text-text-muted">QR unavailable</span>
                      )}
                      {course.letterDownloadUrl ? (
                        <a
                          href={course.letterDownloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-ace underline"
                        >
                          Approval Letter
                        </a>
                      ) : (
                        <span className="text-text-muted">Letter unavailable</span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <a
                          href={`/api/courses/${course.id}/badge`}
                          className="text-ace underline"
                          title="Download marketing logo (PNG)"
                        >
                          Marketing Logo
                        </a>
                        <a
                          href={`/api/courses/${course.id}/badge?format=jpeg`}
                          className="text-text-muted underline"
                          title="Download as JPEG instead"
                        >
                          (or JPEG)
                        </a>
                      </span>
                      <Link
                        href={`/company/applications/${course.applicationId}`}
                        className="text-ace underline"
                      >
                        Application
                      </Link>
                      {isSuperseded ? (
                        <span className="text-text-muted">Renewed</span>
                      ) : renewalInProgress ? (
                        <span className="text-text-muted">Renewal in progress</span>
                      ) : renewable ? (
                        <form action={startCourseRenewal}>
                          <input type="hidden" name="courseId" value={course.id} />
                          <button
                            type="submit"
                            className="font-semibold text-ace underline"
                          >
                            Renew
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <h2 className="mb-3 text-[13px] font-semibold text-navy">In Review</h2>
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        {applications.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-text-muted">
            No pending or rejected applications.
          </p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2 font-semibold">Submitted</th>
                <th className="px-4 py-2 font-semibold">Course Title</th>
                <th className="px-4 py-2 font-semibold">CE Hours</th>
                <th className="px-4 py-2 font-semibold">Format</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">
                  <span className="sr-only">View application</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => (
                <tr key={app.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2 text-text-muted">
                    {app.submittedAt
                      ? app.submittedAt.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-2 font-medium text-navy">
                    {app.courseTitle ?? "(untitled draft)"}
                  </td>
                  <td className="px-4 py-2 text-text-mid tabular-nums">
                    {app.ceHours ? Number(app.ceHours).toFixed(1) : "—"}
                  </td>
                  <td className="px-4 py-2 text-text-mid">
                    {app.deliveryMethod ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    {app.status === "PENDING" ? (
                      <span className="rounded-full bg-ace/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ace-dark">
                        Pending review
                      </span>
                    ) : (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700">
                        Rejected
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/company/applications/${app.id}`}
                      className="whitespace-nowrap text-ace underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
