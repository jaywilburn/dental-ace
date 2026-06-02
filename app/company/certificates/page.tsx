import { PageHeader } from "@/components/portal-shell";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/*
  Certificate Log — Phase 1 placeholder. Once the cert engine ships in
  Weeks 5-6, this page lists every issued_certificates row for the company.
  For now we just show a friendly "no certs yet" + total count if any exist.
*/

export default async function CertificateLogPage() {
  const user = await requireDentalAce();

  const certs = user.companyId
    ? await prisma.issuedCertificate.findMany({
        where: { companyId: user.companyId },
        orderBy: { issuedAt: "desc" },
        take: 100,
      })
    : [];

  return (
    <>
      <PageHeader
        title="Certificate Log"
        subtitle={`${certs.length} certificate${certs.length === 1 ? "" : "s"} issued · Full search lands when the cert engine ships in Weeks 5-6.`}
      />
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        {certs.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12px] text-text-muted">
            No certificates issued yet. Once an attendee completes one of your
            accredited courses, they&apos;ll appear here.
          </p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2 font-semibold">Issued</th>
                <th className="px-4 py-2 font-semibold">Attendee</th>
                <th className="px-4 py-2 font-semibold">Course</th>
                <th className="px-4 py-2 font-semibold">License</th>
                <th className="px-4 py-2 font-semibold">PDF</th>
              </tr>
            </thead>
            <tbody>
              {certs.map((cert) => (
                <tr key={cert.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2 text-text-muted">
                    {cert.issuedAt.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-2 font-medium text-navy">{cert.attendeeName}</td>
                  <td className="px-4 py-2 text-text-mid">
                    {cert.courseType ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-text-muted">
                    {cert.licenseType} · {cert.licenseNumber}
                  </td>
                  <td className="px-4 py-2 text-text-muted">
                    {cert.certPdfUrl ? "✓ Stored" : "—"}
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
