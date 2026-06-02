import { PageHeader } from "@/components/portal-shell";
import { CertUploadForm } from "@/components/protrack/cert-upload-form";
import { requireUser } from "@/lib/auth/session";

/*
  Manual certificate upload. ACE certificates sync automatically; this is for
  everything else (ADA CERP, AGD PACE, state board, other accredited CE).
*/
export default async function UploadCertificatePage() {
  await requireUser();

  return (
    <>
      <PageHeader
        title="Upload Certificate"
        subtitle="Add a CE certificate from any accredited provider. We file it under the matching category automatically."
      />
      <div className="max-w-3xl rounded-lg border border-border bg-white p-5">
        <CertUploadForm />
      </div>
      <p className="mt-3 max-w-3xl rounded-md border border-ver/30 bg-ver-bg px-3 py-2 text-[11px] text-ver-dark text-pretty">
        Files are stored privately and shared only through short-lived signed
        links. ADA CERP and AGD PACE certificates are accepted automatically;
        other uploads are marked pending until reviewed. In-person-only categories
        (such as sedation) require an in-person or hybrid delivery format to count.
      </p>
    </>
  );
}
