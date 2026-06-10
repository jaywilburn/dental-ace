import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createSignedUrl } from "@/lib/storage";

/*
  My Courses — lists every application + accredited course for the company.
  Pending applications show their submitted timestamp; approved courses show
  Course ID, title, expiry, cert-issued count, and the four deliverables:
  Course ID, attendee link, QR code, and approval letter (QR + letter via
  short-lived signed URLs from the uploads bucket, same pattern as the
  certificate log).
*/

export default async function MyCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ just?: string }>;
}) {
  const user = await requireDentalAce();
  const { just } = await searchParams;

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
      },
      orderBy: { submittedAt: "desc" },
      take: 50,
    }),
    prisma.accreditedCourse.findMany({
      where: { companyId: user.companyId },
      orderBy: { approvedAt: "desc" },
      take: 50,
      include: { application: { select: { courseTitle: true } } },
    }),
  ]);

  const appBase = (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\/+$/, "");

  // Signed download URLs expire after 5 minutes; a null means the asset has
  // not been rendered (pre-feature course or a failed asset job).
  const courses = await Promise.all(
    accreditedCourses.map(async (course) => ({
      ...course,
      attendeeUrl: `${appBase}/attend/${course.attendeeLinkToken}`,
      qrDownloadUrl: course.qrCodeUrl
        ? await createSignedUrl("uploads", course.qrCodeUrl).catch(() => null)
        : null,
      letterDownloadUrl: course.approvalLetterUrl
        ? await createSignedUrl("uploads", course.approvalLetterUrl).catch(
            () => null,
          )
        : null,
    })),
  );

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
              {courses.map((course) => (
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
                        <span className="text-text-muted">QR processing</span>
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
                        <span className="text-text-muted">Letter processing</span>
                      )}
                      <a
                        href={`/api/courses/${course.id}/badge`}
                        className="text-ace underline"
                      >
                        Marketing Logo
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2 className="mb-3 text-[13px] font-semibold text-navy">In-flight applications</h2>
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
                    {app.isExpedited ? (
                      <span className="ml-1 rounded bg-ace/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-ace-dark">
                        expedited
                      </span>
                    ) : null}
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
