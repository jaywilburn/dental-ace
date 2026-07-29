import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { FormNav } from "@/components/application-form/form-controls";
import { StepErrors } from "@/components/application-form/field-errors";
import { deriveStepErrors } from "@/lib/forms/field-errors";
import { step3Schema } from "@/lib/forms/application/schemas";
import { PresentersFields } from "@/components/application-form/steps/presenters-fields";
import { requireDentalAce } from "@/lib/auth/session";
import { getSessionApp } from "@/lib/events/session-data";
import { saveSessionPresenters } from "@/lib/events/session-actions";

export default async function SessionPresentersPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionAppId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireDentalAce();
  const { sessionAppId } = await params;
  const { error } = await searchParams;
  const app = await getSessionApp(sessionAppId);
  if (!app) redirect("/company/events/new/sessions");
  if (!app.data.creatorName) {
    redirect(`/company/events/new/sessions/${sessionAppId}/creator`);
  }

  // Errors are re-derived from the draft the failing action just echoed back,
  // so they always line up with what is rendered below. Nothing is stored or
  // passed through the URL, and a stale ?error= over a fixed draft yields none.
  const errors = error === "validation" ? deriveStepErrors(step3Schema, app.data) : {};
  return (
    <>
      <PageHeader title="Event Session" subtitle="Step 3 of 4 — Presenters" />
      <StepErrors error={error} errors={errors} />
      <form action={saveSessionPresenters} className="space-y-5">
        <input type="hidden" name="sessionAppId" value={app.id} />
        <PresentersFields draft={app.data} errors={errors} />
        <FormNav
          back={{ href: `/company/events/new/sessions/${sessionAppId}/creator`, label: "Back" }}
          nextLabel="Next: Question"
        />
      </form>
    </>
  );
}
