import { notFound } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { PageHeader } from "@/components/portal-shell";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { applicationDataReadSchema } from "@/lib/forms/application/schemas";
import {
  courseInfoRows,
  creatorRows,
  organizationRows,
  presenterRows,
} from "@/lib/forms/application/detail-rows";
import { resolveAttachmentLinks } from "@/lib/forms/application/attachments";
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
            courseIdNumber={app.accreditedCourse?.courseIdNumber ?? null}
          />

          <QuizPreviewCard title="Quiz Questions" quiz={data.quiz} />
        </div>
      </div>
    </>
  );
}

function StatusCard({
  status,
  submittedLabel,
  reviewedAt,
  reviewerNotes,
  courseIdNumber,
}: {
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
            <Link href="/company/courses" className="text-ace underline">
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
