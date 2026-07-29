import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/portal-shell";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { applicationDataReadSchema } from "@/lib/forms/application/schemas";
import {
  courseInfoRows,
  creatorRows,
  organizationRows,
  presenterRows,
} from "@/lib/forms/application/detail-rows";
import { resolveAttachmentLinks } from "@/lib/forms/application/attachments";
import {
  isLegacyApplicationData,
  legacyCourseRows,
} from "@/lib/forms/application/legacy";
import { AttachmentsCard } from "@/components/application-form/attachments-card";
import {
  DetailSection,
  QuizPreviewCard,
} from "@/components/application-form/detail-section";
import { approveApplication, rejectApplication } from "@/lib/reviewer/actions";
import { reopenApplication } from "@/lib/reviewer/reopen-actions";

/*
  Application review detail. Shows all fields read-only with approve/reject
  controls. Quiz preview lives in its own column. Approve generates the Course
  ID + assets via the reviewer action; Reject requires notes >= 10 chars.
  Parses with the tolerant read schema so applications submitted before the
  2026-06 form changes (old formats, duration, ADA CERP) stay reviewable.
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
    include: {
      company: { select: { name: true } },
      accreditedCourse: { select: { courseIdNumber: true } },
    },
  });
  if (!app) notFound();

  // Courses migrated from the previous ACE records system carry a stub
  // application_data (no original application exists), so there is nothing to
  // review. Show a neutral course-record view instead of a parse error.
  if (isLegacyApplicationData(app.applicationData)) {
    return (
      <>
        <PageHeader
          title="Application Review"
          subtitle={`${app.company.name} · Migrated course`}
          action={
            <Link
              href="/reviewer"
              className="rounded-md border border-border bg-white px-3 py-1.5 text-[11px] font-semibold text-navy hover:bg-surface"
            >
              ← Back to queue
            </Link>
          }
        />
        <div className="max-w-2xl space-y-5">
          <div className="rounded-md border border-border bg-surface p-4">
            <p className="text-[12px] font-semibold text-navy">Migrated course</p>
            <p className="mt-1 text-[13px] leading-relaxed text-text-mid">
              This course was migrated from the previous ACE records system. The
              original application predates DentalACE One and is not on file, so
              there is no application to review. The course record below shows
              the imported data.
            </p>
          </div>
          <DetailSection
            title="Course Record"
            rows={legacyCourseRows({
              courseTitle: app.courseTitle,
              ceHours: app.ceHours == null ? null : Number(app.ceHours),
              courseType: app.courseType,
              deliveryMethod: app.deliveryMethod,
              status: app.status,
              approvedAt: app.reviewedAt,
              courseIdNumber: app.accreditedCourse?.courseIdNumber ?? null,
            })}
          />
        </div>
      </>
    );
  }

  const parsed = applicationDataReadSchema.safeParse(app.applicationData);
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
  const attachments = await resolveAttachmentLinks(data);

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
          <DetailSection title="Organization & Contact" rows={organizationRows(data)} />

          <DetailSection
            title="Section A — Course Information (Fields 1-12)"
            rows={courseInfoRows(data)}
          />

          <DetailSection
            title="Section B — Course Creator (Fields 13-20)"
            rows={creatorRows(data)}
          />

          <DetailSection
            title="Section C — Presenters (Fields 21-28)"
            rows={presenterRows(data)}
          />

          <AttachmentsCard title="Attachments" links={attachments} />
        </div>

        <div className="space-y-5">
          <QuizPreviewCard title="Quiz Preview (Fields 29-32)" quiz={data.quiz} />

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
                  defaultValue="Course materials are thorough. Objectives clearly meet AADB guidelines. Approve."
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
              {app.status === "REJECTED" ? (
                <form action={reopenApplication} className="mt-3 space-y-2 border-t border-border pt-3">
                  <input type="hidden" name="applicationId" value={app.id} />
                  <label className="block text-[11px] font-semibold text-text-mid">
                    Reopen for review (reason recorded in the audit log, not sent
                    to the provider)
                  </label>
                  <textarea
                    name="reason"
                    required
                    minLength={10}
                    rows={2}
                    className="w-full rounded-md border border-border px-3 py-2 text-[12px] text-navy outline-none focus:border-ace focus:ring-2 focus:ring-ace/30"
                    placeholder="e.g. Rejected in error; the application was complete."
                  />
                  <button
                    type="submit"
                    className="rounded-md bg-navy px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-navy/90"
                  >
                    Reopen for review
                  </button>
                </form>
              ) : null}
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

function countFields(data: unknown): number {
  // Marketing-y label: the form is split into 32 conceptual fields.
  void data;
  return 32;
}
