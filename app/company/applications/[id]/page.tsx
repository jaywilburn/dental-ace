import { notFound } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { PageHeader } from "@/components/portal-shell";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { resubmitApplication } from "@/lib/company/resubmit-actions";
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

/*
  Read-only application detail for the company that submitted it. Lets a
  CE provider re-read everything they submitted (organization, course,
  creator, presenters, quiz, attachments) after submission. Viewing never
  touches credits: credits gate NEW submissions only, so there is no
  requireApplicationCredits() here, only the DentalACE entitlement guard plus
  a company-ownership check. Drafts are excluded; they resume through the
  application form flow instead.
*/

const idSchema = z.string().uuid();

export default async function CompanyApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireDentalAce();
  const { id } = await params;

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success || !user.companyId) notFound();

  const app = await prisma.courseApplication.findFirst({
    where: {
      id: parsedId.data,
      companyId: user.companyId,
      status: { not: "DRAFT" },
    },
    include: {
      accreditedCourse: { select: { courseIdNumber: true } },
    },
  });
  if (!app) notFound();

  const submittedLabel = app.submittedAt
    ? app.submittedAt.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const backLink = (
    <Link
      href="/company/courses"
      className="rounded-md border border-border bg-white px-3 py-1.5 text-[11px] font-semibold text-navy hover:bg-surface"
    >
      ← Back to My Courses
    </Link>
  );

  // Courses migrated from the previous ACE records system carry a stub
  // application_data (no original application exists), so render a neutral
  // course-record view instead of trying to parse a full submission.
  if (isLegacyApplicationData(app.applicationData)) {
    return (
      <>
        <PageHeader
          title="Application Details"
          subtitle={app.courseTitle ?? "Migrated course"}
          action={backLink}
        />
        <div className="max-w-2xl space-y-5">
          <div className="rounded-md border border-border bg-surface p-4">
            <p className="text-[12px] font-semibold text-navy">Migrated course</p>
            <p className="mt-1 text-[13px] leading-relaxed text-text-mid">
              This course was migrated from the previous ACE records system. The
              original application predates DentalACE One and is not on file, so
              full application details are not available. The course record
              below shows the imported data. If you have questions about this
              course, contact info@dentalace.org.
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
          title="Application Details"
          subtitle={app.courseTitle ?? "Submitted application"}
          action={backLink}
        />
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-[13px] text-red-700">
          We could not display this application&apos;s saved data. Please
          contact info@dentalace.org and we will look into it.
        </div>
      </>
    );
  }
  const data = parsed.data;
  const attachments = await resolveAttachmentLinks(data);

  return (
    <>
      <PageHeader
        title="Application Details"
        subtitle={
          submittedLabel
            ? `${data.courseTitle} · Submitted ${submittedLabel}`
            : data.courseTitle
        }
        action={backLink}
      />

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-5">
          <DetailSection title="Organization & Contact" rows={organizationRows(data)} />

          <DetailSection title="Course Information" rows={courseInfoRows(data)} />

          <DetailSection title="Course Creator" rows={creatorRows(data)} />

          <DetailSection title="Presenters" rows={presenterRows(data)} />

          <AttachmentsCard title="Attachments" links={attachments} />
        </div>

        <div className="space-y-5">
          <StatusCard
            status={app.status}
            submittedLabel={submittedLabel}
            reviewedAt={app.reviewedAt}
            reviewerNotes={app.reviewerNotes}
            applicationId={app.id}
            courseIdNumber={app.accreditedCourse?.courseIdNumber ?? null}
          />

          <QuizPreviewCard title="Quiz Questions" quiz={data.quiz} />
        </div>
      </div>
    </>
  );
}

function StatusCard({
  applicationId,
  status,
  submittedLabel,
  reviewedAt,
  reviewerNotes,
  courseIdNumber,
}: {
  applicationId: string;
  status: string;
  submittedLabel: string | null;
  reviewedAt: Date | null;
  reviewerNotes: string | null;
  courseIdNumber: string | null;
}) {
  const reviewedLabel = reviewedAt
    ? reviewedAt.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-semibold text-navy">Status</p>
        <StatusBadge status={status} />
      </div>

      {submittedLabel ? (
        <p className="mt-2 text-[12px] text-text-mid">
          Submitted {submittedLabel}.
        </p>
      ) : null}

      {status === "PENDING" ? (
        <p className="mt-2 text-[12px] leading-relaxed text-text-mid">
          AADB is reviewing this application. You will receive an email when a
          decision is made.
        </p>
      ) : null}

      {status === "APPROVED" ? (
        <div className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-text-mid">
          {reviewedLabel ? <p>Approved {reviewedLabel}.</p> : null}
          {courseIdNumber ? (
            <p>
              Course ID:{" "}
              <span className="font-mono text-[11px] font-semibold text-navy">
                {courseIdNumber}
              </span>
            </p>
          ) : null}
          <p>
            Deliverables (attendee link, QR code, approval letter) are on{" "}
            <Link href="/company/courses" className="text-ace-dark underline">
              My Courses
            </Link>
            .
          </p>
        </div>
      ) : null}

      {status === "REJECTED" ? (
        <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3">
          <p className="text-[11px] font-semibold text-red-700">
            Reviewer feedback{reviewedLabel ? ` (${reviewedLabel})` : ""}
          </p>
          <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-red-700">
            {reviewerNotes ?? "No feedback was recorded for this decision."}
          </p>
          <form action={resubmitApplication} className="mt-3">
            <input type="hidden" name="applicationId" value={applicationId} />
            <button
              type="submit"
              className="rounded-md bg-navy px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-navy/90"
            >
              Revise and resubmit
            </button>
            <span className="ml-2 text-[11px] text-red-700/80">
              Your original credit still covers this, so no new credit is required.
            </span>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "APPROVED") {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
        Approved
      </span>
    );
  }
  if (status === "REJECTED") {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700">
        Rejected
      </span>
    );
  }
  return (
    <span className="rounded-full bg-ace/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ace-dark">
      Pending review
    </span>
  );
}
