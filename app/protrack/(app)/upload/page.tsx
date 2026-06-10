import { PageHeader } from "@/components/portal-shell";
import { CertUploadForm } from "@/components/protrack/cert-upload-form";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { parseCategories } from "@/lib/protrack/progress";

/*
  Manual certificate upload. ACE certificates sync automatically; this is for
  everything else (ADA CERP, AGD PACE, state board, other accredited CE).
  Category options come from the user's own state requirement so uploads file
  directly against their compliance buckets; the generic fallback list inside
  CertUploadForm covers states that are not loaded yet.
*/
export default async function UploadCertificatePage() {
  const user = await requireUser();

  const primary = await prisma.userLicense.findFirst({
    where: { licenseeId: user.id, isPrimary: true },
    select: { state: true, licenseType: true },
  });
  const requirement = primary
    ? await prisma.stateRequirement.findUnique({
        where: {
          state_licenseType: {
            state: primary.state,
            licenseType: primary.licenseType,
          },
        },
        select: { categories: true },
      })
    : null;
  const stateCategories = requirement
    ? parseCategories(requirement.categories).map((c) => c.name)
    : [];

  return (
    <>
      <PageHeader
        title="Upload Certificate"
        subtitle="Add a CE certificate from any accredited provider. We file it under the matching category automatically."
      />
      <div className="max-w-3xl rounded-lg border border-border bg-white p-5">
        <CertUploadForm
          categoryOptions={stateCategories.length ? stateCategories : undefined}
        />
      </div>
      <p className="mt-3 max-w-3xl rounded-md border border-ver/30 bg-ver-bg px-3 py-2 text-[11px] text-ver-dark text-pretty">
        Files are stored privately and shared only through short-lived signed
        links. ADA CERP and AGD PACE certificates are accepted automatically;
        other uploads are marked pending until reviewed. In-person-only
        categories (such as sedation) require the Live/In Person delivery
        format to count.
      </p>
    </>
  );
}
