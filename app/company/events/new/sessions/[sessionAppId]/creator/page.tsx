import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { FormErrorBanner, FormNav } from "@/components/application-form/form-controls";
import { CreatorFields } from "@/components/application-form/steps/creator-fields";
import { requireDentalAce } from "@/lib/auth/session";
import { getSessionApp } from "@/lib/events/session-data";
import { saveSessionCreator } from "@/lib/events/session-actions";

export default async function SessionCreatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionAppId: string }>;
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  await requireDentalAce();
  const { sessionAppId } = await params;
  const { error, detail } = await searchParams;
  const app = await getSessionApp(sessionAppId);
  if (!app) redirect("/company/events/new/sessions");
  if (!app.data.courseTitle) {
    redirect(`/company/events/new/sessions/${sessionAppId}/course`);
  }

  return (
    <>
      <PageHeader title="Event Session" subtitle="Step 2 of 4 — Course Creator" />
      {error === "validation" ? <FormErrorBanner detail={detail} /> : null}
      <form action={saveSessionCreator} className="space-y-5">
        <input type="hidden" name="sessionAppId" value={app.id} />
        <CreatorFields draft={app.data} />
        <FormNav
          back={{ href: `/company/events/new/sessions/${sessionAppId}/course`, label: "Back" }}
          nextLabel="Next: Presenters"
        />
      </form>
    </>
  );
}
