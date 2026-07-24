import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { FormErrorBanner, FormNav } from "@/components/application-form/form-controls";
import { PresentersFields } from "@/components/application-form/steps/presenters-fields";
import { requireDentalAce } from "@/lib/auth/session";
import { getInlineSession } from "@/lib/events/inline-session-data";
import { saveInlineSessionPresenters } from "@/lib/events/inline-session-actions";

/* SELECTIVE_INLINE per-session mini-wizard, Step 3 — Presenters. */
export default async function InlineSessionPresentersPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  await requireDentalAce();
  const { sessionId } = await params;
  const { error, detail } = await searchParams;
  const session = await getInlineSession(sessionId);
  if (!session) redirect("/company/events/new/sessions");
  if (!session.data.creatorName) {
    redirect(`/company/events/new/inline-sessions/${sessionId}/creator`);
  }

  return (
    <>
      <PageHeader title="Event Session" subtitle="Step 3 of 4 — Presenters" />
      {error === "validation" ? <FormErrorBanner detail={detail} /> : null}
      <form action={saveInlineSessionPresenters} className="space-y-5">
        <input type="hidden" name="sessionId" value={session.id} />
        <PresentersFields draft={session.data} />
        <FormNav
          back={{
            href: `/company/events/new/inline-sessions/${sessionId}/creator`,
            label: "Back",
          }}
          nextLabel="Next: Question"
        />
      </form>
    </>
  );
}
