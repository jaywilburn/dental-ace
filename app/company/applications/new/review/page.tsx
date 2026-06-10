import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { ApplicationStepBar } from "@/components/application-form/step-bar";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  ensureDraft,
  getDraftData,
  submitApplication,
} from "@/lib/forms/application/actions";
import { applicationDataSchema, isLiveFormat } from "@/lib/forms/application/schemas";
import { resolveAttachmentLinks } from "@/lib/forms/application/attachments";
import { AttachmentsCard } from "@/components/application-form/attachments-card";

/*
  Step 5 — Review & Submit. Read-only summary of every field on the draft.
  Submit consumes one credit (expedited if chosen + available) and transitions
  the draft from DRAFT to PENDING.
*/
export default async function ApplicationStep5Page() {
  const user = await requireDentalAce();
  const applicationId = await ensureDraft();
  const draft = await getDraftData(applicationId);

  const parsed = applicationDataSchema.safeParse(draft);
  if (!parsed.success) {
    redirect("/company/applications/new");
  }
  const data = parsed.data;

  const company = await prisma.company.findUniqueOrThrow({
    where: { id: user.companyId! },
    select: { applicationCredits: true, expeditedCredits: true },
  });

  const attachments = await resolveAttachmentLinks(data);

  return (
    <>
      <PageHeader
        title="Review & Submit"
        subtitle="Read every field carefully. Submitting consumes 1 application credit."
      />
      <ApplicationStepBar currentStep={5} />

      <section className="space-y-5">
        <ReviewCard
          title="Section A — Course Information"
          editHref="/company/applications/new"
          rows={[
            { label: "Course Title", value: data.courseTitle },
            { label: "CE Credit Hours", value: `${data.ceCreditHours.toFixed(1)} hours` },
            { label: "Category", value: data.subjectMatter },
            { label: "Delivery Format", value: data.deliveryFormat },
            { label: "Target Audience", value: data.targetAudience },
            { label: "Public Protection Statement", value: data.publicProtectionStatement, full: true },
            { label: "Course Objectives", value: data.courseObjectives, full: true },
            ...(isLiveFormat(data.deliveryFormat)
              ? [
                  {
                    label: "Combined Certificate for live attendees?",
                    value: data.combinedCert ? "Yes" : "No",
                  },
                  {
                    label: "Submitting sessions separately?",
                    value: data.submitSessionsSeparately ? "Yes" : "No",
                  },
                ]
              : []),
          ]}
        />

        <ReviewCard
          title="Section B — Course Creator"
          editHref="/company/applications/new/creator"
          rows={[
            { label: "Creator Name", value: data.creatorName },
            { label: "Credentials", value: data.credentials },
            { label: "Current Position", value: data.currentPosition },
            { label: "Professional Bio", value: data.professionalBio, full: true },
          ]}
        />

        <ReviewCard
          title="Section C — Presenters"
          editHref="/company/applications/new/presenters"
          rows={data.presenters.flatMap((p, i) => [
            { label: `Presenter ${i + 1}`, value: `${p.name} · ${p.role}` },
            { label: "Commercial Disclosure", value: p.commercialDisclosure, full: true },
          ])}
        />

        <ReviewCard
          title="Section D — Quiz (5 questions)"
          editHref="/company/applications/new/quiz"
          rows={data.quiz.map((q, i) => ({
            label: `Q${i + 1} (${q.type})`,
            value:
              q.type === "TF"
                ? `${q.question} — Correct: ${q.correctAnswer}`
                : `${q.question} — Correct: ${q.options[q.correctIndex] ?? "(not set)"}`,
            full: true,
          }))}
        />

        {attachments.length > 0 ? (
          <AttachmentsCard title="Section E — Attachments" links={attachments} />
        ) : null}
      </section>

      <form action={submitApplication} className="mt-6">
        <input type="hidden" name="applicationId" value={applicationId} />
        <div className="rounded-lg border border-border bg-white p-5">
          <p className="mb-3 text-[13px] font-semibold text-navy">Choose credit pool</p>
          <div className="space-y-2 text-[12px] text-text-mid">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="useExpedited"
                value="false"
                defaultChecked={company.expeditedCredits === 0}
                disabled={company.applicationCredits === 0}
              />
              Use a standard credit ({company.applicationCredits} available)
              {company.applicationCredits === 0 ? (
                <span className="text-red-500">— none</span>
              ) : null}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="useExpedited"
                value="true"
                defaultChecked={company.expeditedCredits > 0}
                disabled={company.expeditedCredits === 0}
              />
              Use an expedited credit ({company.expeditedCredits} available, ~3 business day review)
              {company.expeditedCredits === 0 ? (
                <span className="text-red-500">— none</span>
              ) : null}
            </label>
          </div>
          {company.applicationCredits + company.expeditedCredits === 0 ? (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
              You have no credits available. Go to{" "}
              <Link className="font-semibold underline" href="/company/buy/credits">
                Buy App Credits
              </Link>{" "}
              before submitting.
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <Link
            href="/company/applications/new/quiz"
            className="rounded-md border border-border bg-white px-4 py-2 text-[12px] font-semibold text-navy transition-colors hover:bg-surface"
          >
            ← Back
          </Link>
          <button
            type="submit"
            disabled={company.applicationCredits + company.expeditedCredits === 0}
            className="rounded-md bg-emerald-600 px-6 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ✓ Submit & Consume 1 Credit
          </button>
        </div>
      </form>
    </>
  );
}

function ReviewCard({
  title,
  editHref,
  rows,
}: {
  title: string;
  editHref: string;
  rows: { label: string; value: string; full?: boolean }[];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white">
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2.5">
        <p className="text-[12px] font-semibold text-navy">{title}</p>
        <Link
          href={editHref}
          className="text-[11px] font-semibold text-ace-dark hover:underline"
        >
          Edit ›
        </Link>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 px-4 py-4 sm:grid-cols-2">
        {rows.map((row, i) => (
          <div key={i} className={row.full ? "sm:col-span-2" : undefined}>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              {row.label}
            </dt>
            <dd className="mt-0.5 whitespace-pre-line text-[13px] text-navy">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
