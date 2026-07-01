import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { FormErrorBanner, FormNav } from "@/components/application-form/form-controls";
import { QuizFields } from "@/components/application-form/steps/quiz-fields";
import { requireDentalAce } from "@/lib/auth/session";
import { getSessionApp } from "@/lib/events/session-data";
import { saveSessionQuiz } from "@/lib/events/session-actions";

export default async function SessionQuizPage({
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
  if (!app.data.presenters?.length) {
    redirect(`/company/events/new/sessions/${sessionAppId}/presenters`);
  }

  return (
    <>
      <PageHeader title="Event Session" subtitle="Step 4 of 4 — Quiz Builder · 5 questions required" />
      {error === "validation" ? <FormErrorBanner detail={detail} /> : null}
      <form action={saveSessionQuiz} className="space-y-4">
        <input type="hidden" name="sessionAppId" value={app.id} />
        <QuizFields draft={app.data} />
        <FormNav
          back={{ href: `/company/events/new/sessions/${sessionAppId}/presenters`, label: "Back" }}
          nextLabel="Save session"
        />
      </form>
    </>
  );
}
