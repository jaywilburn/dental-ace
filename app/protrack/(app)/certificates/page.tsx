import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createSignedUrl } from "@/lib/storage";
import { formatHours } from "@/lib/protrack/progress";
import type { CertSource, VerificationStatus } from "@prisma/client";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/*
  My Certificates. Every certificate on file: ACE auto-synced + manually
  uploaded. Mirrors logic/protrack-dev-mockup-suite.html #certs.
*/
export default async function CertificatesPage() {
  const user = await requireUser();

  const certificates = await prisma.ceCertificate.findMany({
    where: { licenseeId: user.id },
    orderBy: { completedAt: "desc" },
    select: {
      id: true,
      courseTitle: true,
      provider: true,
      source: true,
      category: true,
      hours: true,
      completedAt: true,
      verificationStatus: true,
      fileUrl: true,
    },
  });

  // Short-lived signed download links for uploaded files. download:true forces
  // the browser to save the original file instead of opening it in a tab.
  const signedUrls = await Promise.all(
    certificates.map((c) =>
      c.fileUrl
        ? createSignedUrl("uploads", c.fileUrl, 300, { download: true }).catch(
            () => null,
          )
        : Promise.resolve(null),
    ),
  );

  const totalHours = certificates.reduce((sum, c) => sum + Number(c.hours), 0);

  const uploadAction = (
    <Link
      href="/protrack/upload"
      className="rounded-md bg-navy px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-navy/90"
    >
      ↑ Upload Certificate
    </Link>
  );

  return (
    <>
      <PageHeader
        title="My Certificates"
        subtitle={`${certificates.length} certificate${
          certificates.length === 1 ? "" : "s"
        } on file · ${formatHours(totalHours)} total CE hours`}
        action={uploadAction}
      />

      {certificates.length === 0 ? (
        <div className="rounded-lg border border-border bg-white p-8 text-center">
          <p className="font-serif text-lg font-semibold text-navy">
            No certificates yet
          </p>
          <p className="mx-auto mt-1 max-w-md text-[12px] text-text-muted text-pretty">
            Upload a CE certificate to start tracking your hours. Certificates
            from DentalACE courses sync here automatically.
          </p>
          <Link
            href="/protrack/upload"
            className="mt-4 inline-block rounded-md bg-navy px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-navy/90"
          >
            Upload your first certificate
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2 font-semibold">Course</th>
                  <th className="px-4 py-2 font-semibold">Provider</th>
                  <th className="px-4 py-2 font-semibold">Source</th>
                  <th className="px-4 py-2 font-semibold">Category</th>
                  <th className="px-4 py-2 text-right font-semibold">Hours</th>
                  <th className="px-4 py-2 font-semibold">Date</th>
                  <th className="px-4 py-2 font-semibold">Verified</th>
                  <th className="px-4 py-2 font-semibold">File</th>
                </tr>
              </thead>
              <tbody>
                {certificates.map((cert, i) => (
                  <tr
                    key={cert.id}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="px-4 py-2.5 font-medium text-navy">
                      {cert.courseTitle}
                    </td>
                    <td className="px-4 py-2.5 text-text-mid">{cert.provider}</td>
                    <td className="px-4 py-2.5">
                      <SourceBadge source={cert.source} />
                    </td>
                    <td className="px-4 py-2.5 text-text-mid">{cert.category}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-mid">
                      {formatHours(Number(cert.hours))}
                    </td>
                    <td className="px-4 py-2.5 text-text-muted">
                      {dateFmt.format(cert.completedAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <VerificationBadge status={cert.verificationStatus} />
                    </td>
                    <td className="px-4 py-2.5">
                      {signedUrls[i] ? (
                        <a
                          href={signedUrls[i]!}
                          download
                          rel="noopener noreferrer"
                          className="font-semibold text-ace-dark hover:underline"
                        >
                          ↓ Download
                        </a>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function SourceBadge({ source }: { source: CertSource }) {
  const label: Record<CertSource, string> = {
    ACE: "⭐ ACE",
    ADA_CERP: "ADA CERP",
    AGD_PACE: "AGD PACE",
    UPLOADED: "Uploaded",
  };
  const tone =
    source === "ACE"
      ? "bg-ace-bg text-ace-dark"
      : source === "UPLOADED"
        ? "bg-surface-2 text-text-mid"
        : "bg-ver-bg text-ver-dark";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}
    >
      {label[source]}
    </span>
  );
}

function VerificationBadge({ status }: { status: VerificationStatus }) {
  const map: Record<VerificationStatus, { label: string; tone: string }> = {
    AUTO: { label: "✓ Auto", tone: "text-green-700" },
    ADA_CERP_ACCEPTED: { label: "✓ Accredited", tone: "text-green-700" },
    AGD_PACE_ACCEPTED: { label: "✓ Accredited", tone: "text-green-700" },
    ADMIN_VERIFIED: { label: "✓ Verified", tone: "text-green-700" },
    PENDING: { label: "⏳ Pending", tone: "text-orange-600" },
  };
  const { label, tone } = map[status];
  return <span className={`text-[11px] font-medium ${tone}`}>{label}</span>;
}
