import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/portal-shell";
import { AddCourseForm } from "@/components/admin/add-course-form";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { addApprovedCourse, discardCourseDraft } from "@/lib/admin/course-add";
import { parseDraftValues, todayIso } from "@/lib/admin/course-add-rules";
import { memberDisplayName } from "@/lib/admin/company-members";

/*
  ADMIN-only: add an already-approved course to a company's dashboard, for a
  course accredited outside this site's review queue (first use: DA236 for
  Emme Sanders RDH, approved before DentalACE One and never imported). Reached
  from the Courses section on /admin/companies/[id]. The action and its rules
  live in lib/admin/course-add.ts and lib/admin/course-add-rules.ts.

  ?draft=<id> continues a saved draft (admin_course_drafts). A draft id that
  doesn't belong to this company, or was discarded, simply opens a blank form.
*/

export default async function AdminAddCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ draft?: string; ok?: string }>;
}) {
  await requireStaff("ADMIN");
  const { id } = await params;
  const { draft: draftParam, ok } = await searchParams;
  // The PK is a UUID column; a malformed id would make Prisma throw.
  if (!z.guid().safeParse(id).success) notFound();

  const company = await prisma.company.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!company) notFound();

  const draft = z.guid().safeParse(draftParam).success
    ? await prisma.adminCourseDraft.findFirst({
        where: { id: draftParam, companyId: company.id },
        select: {
          id: true,
          values: true,
          updatedAt: true,
          updatedBy: { select: { email: true, firstName: true, lastName: true } },
        },
      })
    : null;
  const savedAt = draft?.updatedAt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
    timeZoneName: "short",
  });

  return (
    <>
      <PageHeader
        title="Add Approved Course"
        subtitle={company.name}
        action={
          <Link
            href={`/admin/companies/${company.id}#courses`}
            className="whitespace-nowrap rounded-md border border-border bg-white px-3.5 py-2 text-[12px] font-semibold text-navy hover:bg-surface"
          >
            Back to {company.name}
          </Link>
        }
      />
      <div className="mb-5 max-w-3xl rounded-md border border-border bg-surface px-4 py-3 text-pretty text-[13px] leading-relaxed text-text-mid">
        For a course that is already approved for CE but isn&apos;t on this site yet, such as one accredited
        before DentalACE One. It appears on {company.name}&apos;s dashboard right away, with its attendee link, QR
        code and approval letter. The attendee link works as soon as the company has certificates to issue.
      </div>
      {draft ? (
        <div
          className={
            ok === "draft-saved"
              ? "mb-5 flex max-w-3xl flex-col gap-2 rounded-md border border-emerald-400 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-700 sm:flex-row sm:items-center sm:justify-between"
              : "mb-5 flex max-w-3xl flex-col gap-2 rounded-md border border-border bg-white px-4 py-2.5 text-[13px] text-text-mid sm:flex-row sm:items-center sm:justify-between"
          }
        >
          <p className="text-pretty">
            {ok === "draft-saved" ? "Draft saved. " : "Continuing a draft. "}
            Last saved {savedAt} by {memberDisplayName(draft.updatedBy)}. Only admins can see it.
          </p>
          {/* Opening this is the confirm step, like Retire on the company page. */}
          <details className="group shrink-0">
            <summary className="cursor-pointer list-none text-[12px] font-semibold text-red-700 underline hover:text-red-800 [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">Discard draft</span>
              <span className="hidden group-open:inline">Keep draft</span>
            </summary>
            <form action={discardCourseDraft} className="mt-2 flex flex-wrap items-center gap-2">
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="draftId" value={draft.id} />
              <span className="text-[12px] text-red-800">Delete this draft? This can&apos;t be undone.</span>
              <button
                type="submit"
                className="rounded-md bg-red-700 px-3 py-1 text-[12px] font-semibold text-white hover:bg-red-800"
              >
                Discard
              </button>
            </form>
          </details>
        </div>
      ) : null}
      <div className="max-w-3xl">
        <AddCourseForm
          // Remount on every save (and on switching drafts) so the form's
          // defaults are the values just stored, not the ones it mounted with.
          key={draft ? `${draft.id}:${draft.updatedAt.getTime()}` : "new"}
          action={addApprovedCourse}
          companyId={company.id}
          today={todayIso()}
          draftId={draft?.id}
          draftValues={draft ? parseDraftValues(draft.values) : undefined}
        />
      </div>
    </>
  );
}
