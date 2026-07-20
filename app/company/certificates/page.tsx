import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { requireCertificateLogAccess } from "@/lib/company/credit-guards";
import { prisma } from "@/lib/prisma";
import { createSignedUrl } from "@/lib/storage";
import { buildCertWhere } from "@/lib/certificates/query";

/*
  Certificate Log — real listing of issued (passed) certificates for the
  company, searchable by attendee name/email, paginated, with short-lived
  signed-URL PDF downloads and a CSV export of the filtered set. Failed quiz
  attempts (passed=false) are excluded.
*/

const PAGE_SIZE = 25;

export default async function CertificateLogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; course?: string }>;
}) {
  // Redirects to /company/buy/credits when the company has neither credits
  // nor any issued certificates.
  const { user } = await requireCertificateLogAccess();
  const { q, page, course } = await searchParams;
  const pageNum = Math.max(1, Number(page ?? "1") || 1);
  const query = (q ?? "").trim();

  // Course filter options (this company's accredited courses).
  const companyCourses = await prisma.accreditedCourse.findMany({
    where: { companyId: user.companyId ?? "" },
    orderBy: { approvedAt: "desc" },
    select: {
      id: true,
      courseIdNumber: true,
      application: { select: { courseTitle: true } },
    },
  });
  const courseFilter = companyCourses.some((c) => c.id === course)
    ? (course as string)
    : "";

  const where = buildCertWhere(user.companyId, query, courseFilter);

  const [total, certs] = await Promise.all([
    prisma.issuedCertificate.count({ where }),
    prisma.issuedCertificate.findMany({
      where,
      orderBy: { issuedAt: "desc" },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        course: {
          select: {
            courseIdNumber: true,
            application: { select: { courseTitle: true, ceHours: true } },
          },
        },
        event: { select: { name: true } },
      },
    }),
  ]);

  const rows = await Promise.all(
    certs.map(async (cert) => ({
      cert,
      downloadUrl: cert.certPdfUrl
        ? await createSignedUrl("certs", cert.certPdfUrl).catch(() => null)
        : null,
    })),
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Certificate Log"
        subtitle={`${total} certificate${total === 1 ? "" : "s"} issued`}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <form
          action="/company/certificates"
          method="get"
          className="flex flex-1 flex-wrap items-center gap-2"
        >
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search attendee name or email"
            className="min-w-[200px] max-w-sm flex-1 rounded-md border border-border px-3 py-2 text-[13px]"
          />
          <select
            name="course"
            defaultValue={courseFilter}
            className="rounded-md border border-border bg-white px-3 py-2 text-[13px] text-navy"
          >
            <option value="">All courses</option>
            {companyCourses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.application.courseTitle ?? c.courseIdNumber}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-navy px-3.5 py-2 text-[12px] font-semibold text-white hover:bg-navy/90"
          >
            Apply
          </button>
        </form>
        {total > 0 ? (
          <a
            href={`/api/company/certificates/export${
              query || courseFilter
                ? `?${new URLSearchParams({
                    ...(query ? { q: query } : {}),
                    ...(courseFilter ? { course: courseFilter } : {}),
                  })}`
                : ""
            }`}
            className="rounded-md border border-border bg-white px-3.5 py-2 text-[12px] font-semibold text-navy transition-colors hover:bg-surface"
          >
            Export CSV
          </a>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12px] text-text-muted">
            {query ? "No certificates match your search." : "No certificates issued yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2 font-semibold">Issued</th>
                  <th className="px-4 py-2 font-semibold">Attendee</th>
                  <th className="px-4 py-2 font-semibold">Course</th>
                  <th className="px-4 py-2 text-right font-semibold">CE Hours</th>
                  <th className="px-4 py-2 font-semibold">License</th>
                  <th className="px-4 py-2 font-semibold">Certificate</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ cert, downloadUrl }) => (
                  <tr key={cert.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2 text-text-muted">
                      {cert.issuedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="px-4 py-2 font-medium text-navy">
                      {cert.attendeeName}
                      <span className="block text-[11px] font-normal text-text-muted">
                        {cert.attendeeEmail}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-text-mid">
                      {cert.course?.application.courseTitle ??
                        cert.course?.courseIdNumber ??
                        cert.event?.name ??
                        "—"}
                    </td>
                    <td className="px-4 py-2 text-right text-text-mid tabular-nums">
                      {cert.ceHours
                        ? Number(cert.ceHours).toFixed(1)
                        : cert.course?.application.ceHours
                          ? Number(cert.course.application.ceHours).toFixed(1)
                          : "—"}
                    </td>
                    <td className="px-4 py-2 text-text-muted">
                      {cert.licenseType ?? ""} {cert.licenseNumber ?? ""}
                    </td>
                    <td className="px-4 py-2">
                      {downloadUrl ? (
                        <a href={downloadUrl} className="text-ace-dark underline" target="_blank" rel="noopener noreferrer">
                          Download PDF
                        </a>
                      ) : (
                        <span className="text-text-muted">Processing</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-[12px] text-text-muted">
          <span>Page {pageNum} of {totalPages}</span>
          <div className="flex gap-2">
            {pageNum > 1 && (
              <Link className="rounded-md border border-border px-3 py-1" href={`/company/certificates?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(courseFilter ? { course: courseFilter } : {}), page: String(pageNum - 1) })}`}>
                Previous
              </Link>
            )}
            {pageNum < totalPages && (
              <Link className="rounded-md border border-border px-3 py-1" href={`/company/certificates?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(courseFilter ? { course: courseFilter } : {}), page: String(pageNum + 1) })}`}>
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
