import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { ApplicationStepBar } from "@/components/application-form/step-bar";
import { requireApplicationCredits } from "@/lib/company/credit-guards";
import {
  ensureDraft,
  getDraftData,
  submitApplication,
} from "@/lib/forms/application/actions";
import { applicationDataSchema } from "@/lib/forms/application/schemas";
import { sanitizeRichText } from "@/lib/forms/application/rich-text";
import { resolveAttachmentLinks } from "@/lib/forms/application/attachments";
import { AttachmentsCard } from "@/components/application-form/attachments-card";

/*
  Step 5 — Review & Submit. Read-only summary of every field on the draft.
  Submit consumes one application credit and transitions the draft from DRAFT
  to PENDING.
*/
export default async function ApplicationStep5Page() {
  // Redirects to /company/buy/credits when the company holds no credits.
  // ensureDraft FIRST: a revision after a rejection is free, so the credit
  // guard needs the application id to know it may skip the balance check.
  const applicationId = await ensureDraft();
  const { credits: company } = await requireApplicationCredits({ applicationId });
  const draft = await getDraftData(applicationId);

  const parsed = applicationDataSchema.safeParse(draft);
  if (!parsed.success) {
    redirect("/company/applications/new");
  }
  const data = parsed.data;

  const attachments = await resolveAttachmentLinks(data);

  return (
    <>
      <PageHeader
        title="Review & Submit"
        subtitle="Read every field carefully. Submitting consumes 1 application credit."
      />
      <ApplicationStepBar currentStep={6} />

      <section className="space-y-5">
        <ReviewCard
          title="Section A — Organization & Contact"
          editHref="/company/applications/new"
          rows={[
            { label: "Organization", value: data.organizationName },
            { label: "Address", value: data.organizationAddress, full: true },
            { label: "Process Administrator", value: data.adminName },
            { label: "Admin Email", value: data.adminEmail },
            { label: "Admin Phone", value: data.adminPhone },
          ]}
        />

        <ReviewCard
          title="Section B — Course Information"
          editHref="/company/applications/new/course"
          rows={[
            { label: "Course Title", value: data.courseTitle },
            { label: "CE Credit Hours", value: `${data.ceCreditHours.toFixed(1)} hours` },
            { label: "Category", value: data.subjectMatter },
            { label: "Course Format", value: data.deliveryFormat },
            { label: "Most-Used Format", value: data.primaryDistributionFormat },
            { label: "Public Protection Statement", value: data.publicProtectionStatement, full: true },
            { label: "Short Description", value: data.shortDescription, full: true },
            { label: "Course Objectives", value: data.courseObjectives, full: true },
            { label: "Course Outline", value: data.courseOutline, full: true },
          ]}
        />

        <ReviewCard
          title="Section C — Course Creator"
          editHref="/company/applications/new/creator"
          rows={[
            { label: "Creator Name", value: data.creatorName },
            { label: "Credentials", value: data.credentials },
            { label: "Current Position", value: data.currentPosition },
            { label: "Creator Email", value: data.creatorEmail },
            { label: "Creator Phone", value: data.creatorPhone },
            { label: "Creator Address", value: data.creatorAddress, full: true },
            { label: "Highest Degree", value: data.highestDegree },
            { label: "Education Part 1", value: data.educationPart1, full: true },
            ...(data.educationPart2 ? [{ label: "Education Part 2", value: data.educationPart2, full: true }] : []),
            ...(data.educationPart3 ? [{ label: "Education Part 3", value: data.educationPart3, full: true }] : []),
            { label: "Education Part 4", value: data.educationPart4, full: true },
            { label: "Experience Relative to Subject", value: data.creatorExperience, full: true },
            {
              label: "Detailed Bio",
              value: sanitizeRichText(data.detailedBioHtml),
              full: true,
              html: true,
            },
          ]}
        />

        <ReviewCard
          title="Section D — Presenters"
          editHref="/company/applications/new/presenters"
          rows={data.presenters.flatMap((p, i) => [
            { label: `Presenter ${i + 1}`, value: `${p.name} · ${p.role}` },
            { label: "Commercial Disclosure", value: p.commercialDisclosure, full: true },
            { label: "Experience", value: p.experience, full: true },
            { label: "Training Received", value: p.training, full: true },
            { label: "Bio", value: p.bio, full: true },
          ])}
        />

        <ReviewCard
          title="Section E — Quiz (5 questions)"
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
          <AttachmentsCard title="Section F — Attachments" links={attachments} />
        ) : null}
      </section>

      <form action={submitApplication} className="mt-6">
        <input type="hidden" name="applicationId" value={applicationId} />
        <div className="rounded-lg border border-border bg-white p-5 text-[12px] text-text-mid">
          Submitting consumes 1 application credit. You have{" "}
          <span className="font-semibold text-navy">
            {company.applicationCredits}
          </span>{" "}
          available.
          {company.applicationCredits === 0 ? (
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
            disabled={company.applicationCredits === 0}
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
  // html rows must contain ONLY sanitizeRichText() output (see rich-text.ts).
  rows: { label: string; value: string; full?: boolean; html?: boolean }[];
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
            {row.html ? (
              <dd
                className="mt-0.5 text-[13px] leading-relaxed text-navy [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc"
                dangerouslySetInnerHTML={{ __html: row.value }}
              />
            ) : (
              <dd className="mt-0.5 whitespace-pre-line text-[13px] text-navy">
                {row.value}
              </dd>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}
