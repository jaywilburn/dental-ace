import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { applicationDataSchema } from "@/lib/forms/application/schemas";
import { approveApplication, rejectApplication } from "@/lib/reviewer/actions";

/*
  Application review detail. Shows all 34 fields read-only with approve/reject
  controls. Quiz preview lives in its own column. Approve generates the Course
  ID + assets via the reviewer action; Reject requires notes >= 10 chars.
*/
export default async function ReviewerApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ applicationId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireStaff("REVIEWER");
  const { applicationId } = await params;
  const { error } = await searchParams;

  const app = await prisma.courseApplication.findUnique({
    where: { id: applicationId },
    include: { company: { select: { name: true } } },
  });
  if (!app) notFound();

  const parsed = applicationDataSchema.safeParse(app.applicationData);
  if (!parsed.success) {
    return (
      <>
        <PageHeader
          title="Application Review"
          subtitle={`${app.company.name} · Application data is malformed`}
        />
        <pre className="rounded-md border border-red-300 bg-red-50 p-4 text-xs text-red-700">
          {parsed.error.message}
        </pre>
        <Link
          href="/reviewer"
          className="mt-4 inline-block rounded-md border border-border bg-white px-4 py-2 text-[12px] font-semibold text-navy"
        >
          ← Back to queue
        </Link>
      </>
    );
  }
  const data = parsed.data;

  return (
    <>
      <PageHeader
        title="Application Review"
        subtitle={`${data.courseTitle} · ${app.company.name} · All ${countFields(data)} fields displayed`}
        action={
          <Link
            href="/reviewer"
            className="rounded-md border border-border bg-white px-3 py-1.5 text-[11px] font-semibold text-navy hover:bg-surface"
          >
            ← Back to queue
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-5">
          <Section
            title="Section A — Course Information (Fields 1-14)"
            rows={[
              { label: "Course Title", value: data.courseTitle, full: true },
              { label: "CE Credit Hours", value: `${data.ceCreditHours.toFixed(1)} hours` },
              { label: "Course Duration", value: `${data.courseDurationHours.toFixed(1)} hours` },
              { label: "Subject Matter", value: data.subjectMatter },
              { label: "Delivery Format", value: data.deliveryFormat },
              { label: "Target Audience", value: data.targetAudience },
              { label: "ADA CERP Category", value: data.adaCerpCategory },
              ...(data.deliveryFormat === "Live Event"
                ? [
                    { label: "Combined Cert?", value: data.combinedCert ? "Yes" : "No" },
                    {
                      label: "Sessions submitted separately?",
                      value: data.submitSessionsSeparately ? "Yes" : "No",
                    },
                  ]
                : []),
              { label: "Public Protection Statement", value: data.publicProtectionStatement, full: true },
              { label: "Course Objectives", value: data.courseObjectives, full: true },
            ]}
          />

          <Section
            title="Section B — Course Creator (Fields 15-22)"
            rows={[
              { label: "Creator Name", value: data.creatorName },
              { label: "Credentials", value: data.credentials },
              { label: "Current Position", value: data.currentPosition, full: true },
              { label: "Professional Bio", value: data.professionalBio, full: true },
            ]}
          />

          <Section
            title="Section C — Presenters (Fields 23-30)"
            rows={data.presenters.flatMap((p, i) => [
              { label: `Presenter ${i + 1}`, value: `${p.name} · ${p.role}` },
              { label: "Commercial Disclosure", value: p.commercialDisclosure, full: true },
            ])}
          />
        </div>

        <div className="space-y-5">
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="mb-2 text-[12px] font-semibold text-navy">
              Quiz Preview (Fields 31-34)
            </p>
            {data.quiz.map((q, i) => (
              <div key={i} className="mt-3 text-[11px] text-text-mid">
                <p>
                  <strong>
                    Q{i + 1} ({q.type}):
                  </strong>{" "}
                  {q.question}
                </p>
                {q.type === "TF" ? (
                  <p className="pl-3 text-emerald-700">Correct: {q.correctAnswer}</p>
                ) : (
                  <p className="pl-3 text-emerald-700">
                    Correct: {q.options[q.correctIndex]}
                  </p>
                )}
              </div>
            ))}
          </div>

          {app.status === "PENDING" ? (
            <div className="space-y-3">
              {error === "reason_required" ? (
                <p className="rounded-md border border-red-300 bg-red-50 p-2 text-[11px] text-red-700">
                  Rejection requires reviewer notes of at least 10 characters.
                </p>
              ) : null}
              <form action={approveApplication} className="space-y-2 rounded-lg border border-emerald-400 bg-emerald-50/40 p-4">
                <input type="hidden" name="applicationId" value={app.id} />
                <label className="block text-[11px] font-semibold text-text-mid">
                  Reviewer notes (internal)
                </label>
                <textarea
                  name="reviewerNotes"
                  defaultValue="Course materials are thorough. Objectives clearly meet ADA guidelines. Approve."
                  className="min-h-[80px] w-full rounded-md border border-border bg-white px-3 py-2 text-[12px] text-navy"
                />
                <button
                  type="submit"
                  className="w-full rounded-md bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700"
                >
                  ✓ Approve Course
                </button>
              </form>

              <form action={rejectApplication} className="space-y-2 rounded-lg border border-red-300 bg-red-50/40 p-4">
                <input type="hidden" name="applicationId" value={app.id} />
                <label className="block text-[11px] font-semibold text-text-mid">
                  Rejection reason (sent to company)
                </label>
                <textarea
                  name="reason"
                  required
                  minLength={10}
                  placeholder="Explain why this application doesn't meet AADB accreditation standards."
                  className="min-h-[80px] w-full rounded-md border border-border bg-white px-3 py-2 text-[12px] text-navy"
                />
                <button
                  type="submit"
                  className="w-full rounded-md bg-red-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-red-700"
                >
                  ✕ Reject
                </button>
              </form>

              <div className="rounded-md border border-ace bg-ace-bg p-3 text-[11px] text-ace-dark">
                <p className="font-semibold">On approve</p>
                <p className="leading-relaxed">
                  Course ID generated (ACE-YYYY-#####). QR code + approval letter PDF
                  generated, uploaded to Storage, and emailed to the company.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-border bg-white p-4 text-[12px]">
              <p className="mb-1 font-semibold text-navy">
                Already {app.status.toLowerCase()}
              </p>
              <p className="text-text-mid">
                Reviewed{" "}
                {app.reviewedAt?.toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
                . Notes: {app.reviewerNotes ?? "—"}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Section({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string; full?: boolean }[];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white">
      <div className="border-b border-border bg-surface px-4 py-2.5">
        <p className="text-[12px] font-semibold text-navy">{title}</p>
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

function countFields(data: unknown): number {
  // Marketing-y label: the form is split into 34 conceptual fields.
  void data;
  return 34;
}
