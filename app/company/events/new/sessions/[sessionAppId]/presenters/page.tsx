import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { FormErrorBanner, FormNav } from "@/components/application-form/form-controls";
import { PresentersFields } from "@/components/application-form/steps/presenters-fields";
import { requireDentalAce } from "@/lib/auth/session";
import { getSessionApp } from "@/lib/events/session-data";
import { saveSessionPresenters } from "@/lib/events/session-actions";

export default async function SessionPresentersPage({
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
  if (!app.data.creatorName) {
    redirect(`/company/events/new/sessions/${sessionAppId}/creator`);
  }

  return (
    <>
      <PageHeader title="Event Session" subtitle="Step 3 of 4 — Presenters" />
      {error === "validation" ? <FormErrorBanner detail={detail} /> : null}
      <form action={saveSessionPresenters} className="space-y-5">
        <input type="hidden" name="sessionAppId" value={app.id} />
        <PresentersFields draft={app.data} />
        <FormNav
          back={{ href: `/company/events/new/sessions/${sessionAppId}/creator`, label: "Back" }}
          nextLabel="Next: Quiz Builder"
        />
      </form>
    </>
  );
}
