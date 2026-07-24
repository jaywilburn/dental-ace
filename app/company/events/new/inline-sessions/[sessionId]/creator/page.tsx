import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { FormErrorBanner, FormNav } from "@/components/application-form/form-controls";
import { CreatorFields } from "@/components/application-form/steps/creator-fields";
import { requireDentalAce } from "@/lib/auth/session";
import { getInlineSession } from "@/lib/events/inline-session-data";
import { saveInlineSessionCreator } from "@/lib/events/inline-session-actions";

/* SELECTIVE_INLINE per-session mini-wizard, Step 2 — Course Creator. */
export default async function InlineSessionCreatorPage({
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
  if (!session.data.courseTitle) {
    redirect(`/company/events/new/inline-sessions/${sessionId}/course`);
  }

  return (
    <>
      <PageHeader title="Event Session" subtitle="Step 2 of 4 — Course Creator" />
      {error === "validation" ? <FormErrorBanner detail={detail} /> : null}
      <form action={saveInlineSessionCreator} className="space-y-5">
        <input type="hidden" name="sessionId" value={session.id} />
        <CreatorFields draft={session.data} />
        <FormNav
          back={{
            href: `/company/events/new/inline-sessions/${sessionId}/course`,
            label: "Back",
          }}
          nextLabel="Next: Presenters"
        />
      </form>
    </>
  );
}
