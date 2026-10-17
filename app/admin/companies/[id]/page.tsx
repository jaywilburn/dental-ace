import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/portal-shell";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { adjustAppCredits, adjustCertBalance } from "@/lib/admin/billing-overrides";
import { txnLabel } from "@/lib/billing/transaction-labels";
import { renameCompany } from "@/lib/admin/company-rename";
import { renameCourse } from "@/lib/admin/course-rename";
import { setCompanyFeature } from "@/lib/admin/company-features";
import {
  COMPANY_FEATURES,
  COMPANY_FEATURE_LABEL,
  type CompanyFeature,
} from "@/lib/admin/company-feature-rules";
import { memberDisplayName, pointOfContactId } from "@/lib/admin/company-members";
import { hasCertificateQuiz, quizEditorPath } from "@/lib/admin/course-quiz-status";
import { parseStoredSurvey } from "@/lib/events/survey-schemas";
import { surveyResponseCounts } from "@/lib/events/survey-response-counts";
import { cn } from "@/lib/utils";

// Copy for the Features card. Labels come from company-feature-rules so the
// buttons, the success message and the audit summary all name a feature alike.
const FEATURE_COPY: Record<CompanyFeature, { title: string; description: string }> = {
  surveyEnabled: {
    title: "Event surveys",
    description:
      "Adds a custom, ungraded survey to this company's event attendee links. The company and admins can edit it.",
  },
  attendanceCodesEnabled: {
    title: "Attendance codes",
    description:
      "Lets selective events ask attendees to type a code announced in each session instead of answering a multiple choice question.",
  },
};

function isCompanyFeature(v: string | undefined): v is CompanyFeature {
  return (COMPANY_FEATURES as readonly string[]).includes(v ?? "");
}

export default async function AdminCompanyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string; feature?: string }>;
}) {
  await requireStaff("ADMIN");
  const { id } = await params;
  const { ok, error, feature } = await searchParams;

  const company = await prisma.company.findUnique({
    where: { id },
    select: {
      id: true, name: true, applicationCredits: true,
      certBalance: true, certAlertThreshold: true, totalCertsIssued: true,
      contactEmail: true, contactPhone: true, addressLine1: true,
      addressLine2: true, city: true, state: true, zip: true,
      surveyEnabled: true, attendanceCodesEnabled: true,
      users: {
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true, firstName: true, lastName: true, staffRole: true, createdAt: true },
      },
      billingTransactions: { orderBy: { createdAt: "desc" }, take: 15 },
      // Standalone courses only: event sessions author their question through
      // the event. Superseded rows were replaced by a renewal.
      accreditedCourses: {
        where: { eventId: null, supersededAt: null },
        orderBy: { approvedAt: "desc" },
        select: {
          id: true, courseIdNumber: true, expiresAt: true, certsIssuedCount: true,
          quizQuestions: true, application: { select: { courseTitle: true } },
        },
      },
    },
  });
  if (!company) notFound();

  const pocId = pointOfContactId(company.users);
  const now = new Date();
  const courses = company.accreditedCourses.map((c) => ({
    ...c,
    hasQuiz: hasCertificateQuiz(c.quizQuestions),
    expired: c.expiresAt < now,
  }));
  const needsQuiz = courses.filter((c) => !c.hasQuiz && !c.expired).length;

  // Event surveys: only while the feature is on. Drafts are still in the
  // wizard, so they have no survey to edit yet.
  const surveyEvents = company.surveyEnabled
    ? await prisma.event.findMany({
        where: { companyId: company.id, status: { not: "DRAFT" } },
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, eventIdNumber: true, eventDate: true, status: true, survey: true },
      })
    : [];
  const responseCounts = await surveyResponseCounts(surveyEvents.map((e) => e.id));

  return (
    <>
      <PageHeader title={company.name} subtitle="Company overrides (append-only)" />
      {ok ? (
        <div className="mb-4 rounded-md border border-emerald-400 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-700">
          {ok === "feature" && isCompanyFeature(feature)
            ? `${FEATURE_COPY[feature].title} ${company[feature] ? "turned on" : "turned off"} for this company.`
            : ok === "renamed"
            ? "Company name updated."
            : ok === "course-renamed"
              ? "Course title updated."
              : ok === "credits"
              ? "Application credits updated."
              : ok === "balance"
                ? "Certificate balance updated."
                : "Override applied."}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-md border border-red-400 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">App Credits</p>
          <p className="font-serif text-2xl font-bold text-navy tabular-nums">{company.applicationCredits}</p>
          <p className="text-[11px] text-text-muted">Never expire</p>
        </div>
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Cert Balance</p>
          <p className="font-serif text-2xl font-bold text-navy tabular-nums">{company.certBalance}</p>
          <p className="text-[11px] text-text-muted">threshold {company.certAlertThreshold}</p>
        </div>
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Total Certs Issued</p>
          <p className="font-serif text-2xl font-bold text-navy tabular-nums">{company.totalCertsIssued}</p>
        </div>
      </div>

      <section id="features" aria-labelledby="features-heading" className="mt-5 overflow-hidden rounded-lg border border-border bg-white">
        <div className="border-b border-border px-4 py-3">
          <h2 id="features-heading" className="text-balance text-[12px] font-semibold text-navy">Features</h2>
          <p className="text-pretty text-[11px] text-text-muted">
            Optional features for this company. Turning one off hides it but keeps anything already set up.
            Changes are recorded in the audit log.
          </p>
        </div>
        <ul className="divide-y divide-border">
          {COMPANY_FEATURES.map((f) => {
            const on = company[f];
            return (
              <li key={f} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-navy">
                    {FEATURE_COPY[f].title}
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none",
                        on ? "bg-emerald-50 text-emerald-700" : "bg-surface text-text-mid",
                      )}
                    >
                      {on ? "On" : "Off"}
                    </span>
                  </p>
                  <p className="mt-0.5 text-pretty text-[11px] text-text-muted">{FEATURE_COPY[f].description}</p>
                </div>
                <form action={setCompanyFeature} className="shrink-0">
                  <input type="hidden" name="companyId" value={company.id} />
                  <input type="hidden" name="feature" value={f} />
                  <input type="hidden" name="enabled" value={on ? "false" : "true"} />
                  <button
                    type="submit"
                    className={cn(
                      "inline-flex min-h-9 items-center rounded-md px-3 text-[12px] font-semibold sm:min-h-8",
                      on
                        ? "border border-border bg-white text-navy hover:bg-surface"
                        : "bg-navy text-white hover:bg-navy/90",
                    )}
                  >
                    {on ? "Turn off" : "Turn on"} {COMPANY_FEATURE_LABEL[f]}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>

      {company.surveyEnabled ? (
        <section id="events" aria-labelledby="events-heading" className="mt-5 overflow-hidden rounded-lg border border-border bg-white">
          <div className="border-b border-border px-4 py-3">
            <h2 id="events-heading" className="text-balance text-[12px] font-semibold text-navy">Event surveys</h2>
            <p className="text-pretty text-[11px] text-text-muted">
              The optional survey attendees answer after the quiz on each event link. Admin edits are recorded in
              the audit log.
            </p>
          </div>
          {surveyEvents.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12px] text-text-muted">No submitted events yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {surveyEvents.map((e) => {
                const questions = parseStoredSurvey(e.survey).length;
                const responses = responseCounts.get(e.id) ?? 0;
                return (
                  <li key={e.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-pretty text-[13px] font-medium text-navy">{e.name || "Untitled event"}</p>
                      <p className="mt-0.5 text-[11px] text-text-muted tabular-nums">
                        {e.eventIdNumber ? <span className="font-mono">{e.eventIdNumber}</span> : e.status}
                        {e.eventDate ? ` · ${e.eventDate}` : null}
                        {" · "}
                        {questions} question{questions === 1 ? "" : "s"}
                        {" · "}
                        {responses} response{responses === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/companies/${company.id}/events/${e.id}/survey`}
                        className={cn(
                          "inline-flex min-h-9 items-center rounded-md px-3 text-[12px] font-semibold sm:min-h-8",
                          questions > 0
                            ? "border border-border bg-white text-navy hover:bg-surface"
                            : "bg-navy text-white hover:bg-navy/90",
                        )}
                      >
                        {questions > 0 ? "Edit survey" : "Add survey"}
                      </Link>
                      <a
                        href={`/api/admin/events/${e.id}/survey-export`}
                        className="inline-flex min-h-9 items-center rounded-md border border-border bg-white px-3 text-[12px] font-semibold text-navy hover:bg-surface sm:min-h-8"
                      >
                        Download responses
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      <section id="courses" aria-labelledby="courses-heading" className="mt-5 overflow-hidden rounded-lg border border-border bg-white">
        <div className="border-b border-border px-4 py-3">
          <h2 id="courses-heading" className="text-[12px] font-semibold text-navy">Courses</h2>
          <p className="text-pretty text-[11px] text-text-muted">
            Attendees can only claim a certificate for a course that has a 5-question certificate quiz.
          </p>
        </div>
        {needsQuiz > 0 ? (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-[12px] font-semibold text-amber-900 tabular-nums">
              {needsQuiz} active course{needsQuiz === 1 ? " needs" : "s need"} a certificate quiz
            </p>
            <p className="mt-0.5 text-pretty text-[12px] text-amber-800">
              Until a quiz is added, the attendee link and QR code show &ldquo;not configured for
              certificates.&rdquo; Use Add quiz to enter the provider&apos;s 5 questions. The link works as soon as
              the quiz is saved.
            </p>
          </div>
        ) : null}
        {courses.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-text-muted">No accredited courses yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {courses.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-pretty text-[13px] font-medium text-navy">
                      {c.application.courseTitle ?? "Untitled course"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-text-muted tabular-nums">
                      <span className="font-mono">{c.courseIdNumber}</span>
                      {" · "}
                      {c.expired ? "Expired" : "Expires"}{" "}
                      {c.expiresAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      {" · "}
                      {c.certsIssuedCount} cert{c.certsIssuedCount === 1 ? "" : "s"} issued
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none",
                        c.hasQuiz ? "bg-emerald-50 text-emerald-700" : "bg-amber-100 text-amber-800",
                      )}
                    >
                      {c.hasQuiz ? "Quiz ready" : "No quiz"}
                    </span>
                    <Link
                      href={quizEditorPath(c.id)}
                      className={cn(
                        "inline-flex min-h-9 items-center rounded-md px-3 text-[12px] font-semibold sm:min-h-8",
                        c.hasQuiz
                          ? "border border-border bg-white text-navy hover:bg-surface"
                          : "bg-navy text-white hover:bg-navy/90",
                      )}
                    >
                      {c.hasQuiz ? "Edit quiz" : "Add quiz"}
                    </Link>
                  </div>
                </div>
                {/* No-JS disclosure: this page is a server component, so the rename
                    form opens with a native <details> instead of client state. */}
                <details className="group mt-2">
                  <summary className="inline-flex min-h-9 cursor-pointer list-none items-center rounded-md border border-border bg-white px-3 text-[12px] font-semibold text-navy hover:bg-surface sm:min-h-8 [&::-webkit-details-marker]:hidden">
                    <span className="group-open:hidden">Rename</span>
                    <span className="hidden group-open:inline">Cancel rename</span>
                  </summary>
                  <form action={renameCourse} className="mt-3 space-y-3 rounded-md border border-border bg-surface p-3">
                    <input type="hidden" name="courseId" value={c.id} />
                    <label className="block text-[12px] font-semibold text-navy">
                      New title
                      <input
                        type="text"
                        name="title"
                        defaultValue={c.application.courseTitle ?? ""}
                        required
                        minLength={3}
                        maxLength={200}
                        className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] font-normal"
                      />
                    </label>
                    <p className="text-pretty text-[11px] text-text-muted">
                      Updates the title everywhere it appears, including the approval letter and ProTrack
                      records synced from this course. Certificates already downloaded are not reissued. The
                      change is recorded in the audit log.
                    </p>
                    <button type="submit" className="rounded-md bg-navy px-3 py-1.5 text-[12px] font-semibold text-white">
                      Save title
                    </button>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      {company.contactEmail || company.addressLine1 ? (
        <div className="mt-5 rounded-lg border border-border bg-white p-4">
          <p className="mb-2 text-[12px] font-semibold text-navy">Contact</p>
          <div className="grid gap-2 text-[12px] text-text-mid sm:grid-cols-2">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-text-muted">Email</p>
              <p>{company.contactEmail ?? "Not provided"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-text-muted">Phone</p>
              <p>{company.contactPhone ?? "Not provided"}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-[10px] uppercase tracking-wide text-text-muted">Address</p>
              <p>
                {[
                  company.addressLine1,
                  company.addressLine2,
                  [company.city, company.state, company.zip].filter(Boolean).join(", "),
                ]
                  .filter(Boolean)
                  .join(", ") || "Not provided"}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-5 overflow-hidden rounded-lg border border-border bg-white">
        <p className="border-b border-border px-4 py-3 text-[12px] font-semibold text-navy">Members</p>
        {company.users.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-text-muted">No linked accounts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2 font-semibold">Name</th>
                  <th className="px-4 py-2 font-semibold">Email</th>
                  <th className="px-4 py-2 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody>
                {company.users.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2 font-medium text-navy">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Link href={`/admin/users/${u.id}`} className="text-ace-dark underline">
                          {memberDisplayName(u)}
                        </Link>
                        {u.id === pocId ? (
                          <span className="inline-flex items-center rounded-full bg-ace-bg px-2 py-0.5 text-[10px] font-semibold leading-none text-ace-dark">
                            Point of contact
                          </span>
                        ) : null}
                        {u.staffRole !== "NONE" ? (
                          <span className="inline-flex items-center rounded-full bg-navy px-2 py-0.5 text-[10px] font-semibold leading-none text-white">
                            {u.staffRole}
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-text-mid">{u.email}</td>
                    <td className="px-4 py-2 text-text-muted tabular-nums">
                      {u.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <form action={renameCompany} className="mt-5 rounded-lg border border-border bg-white p-4 space-y-3">
        <input type="hidden" name="companyId" value={company.id} />
        <p className="text-[12px] font-semibold text-navy">Rename company</p>
        <input type="text" name="name" defaultValue={company.name} required minLength={2} maxLength={200}
          className="w-full rounded-md border border-border px-3 py-2 text-[13px]" />
        <p className="text-[11px] text-text-muted">
          Updates the name everywhere it appears, including ProTrack records synced from this company&apos;s certificates. The change is recorded in the audit log.
        </p>
        <button type="submit" className="rounded-md bg-navy px-3 py-1.5 text-[12px] font-semibold text-white">Rename</button>
      </form>

      <h2 className="mt-6 mb-1 text-[13px] font-semibold text-navy">Adjust balances</h2>
      <p className="mb-3 text-[11px] text-text-muted">
        These are two separate balances. Application credits pay to submit a course for accreditation;
        certificates are consumed when an attendee claims one. Check the heading before you apply.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <form action={adjustAppCredits} className="rounded-lg border-2 border-ace bg-white p-4 space-y-3">
          <input type="hidden" name="companyId" value={company.id} />
          <div>
            <p className="text-[12px] font-semibold text-navy">Application credits</p>
            <p className="text-[11px] text-text-muted">
              Currently <span className="font-semibold tabular-nums text-navy">{company.applicationCredits}</span>
            </p>
          </div>
          <input type="number" name="delta" step={1} required placeholder="Delta (e.g. 5 or -5)"
            className="w-full rounded-md border border-border px-3 py-2 text-[13px]" />
          <p className="text-[11px] text-text-muted">
            Negative removes credits, for reversing a grant made to the wrong balance. Never below zero.
          </p>
          <button type="submit" className="rounded-md bg-navy px-3 py-1.5 text-[12px] font-semibold text-white">
            Apply to application credits
          </button>
        </form>

        <form action={adjustCertBalance} className="rounded-lg border-2 border-border bg-white p-4 space-y-3">
          <input type="hidden" name="companyId" value={company.id} />
          <div>
            <p className="text-[12px] font-semibold text-navy">Certificate balance</p>
            <p className="text-[11px] text-text-muted">
              Currently <span className="font-semibold tabular-nums text-navy">{company.certBalance}</span>
            </p>
          </div>
          <input type="number" name="delta" step={1} required placeholder="Delta (e.g. 100 or -10)"
            className="w-full rounded-md border border-border px-3 py-2 text-[13px]" />
          <p className="text-[11px] text-text-muted">
            Negative reduces the balance. Never below zero.
          </p>
          <button type="submit" className="rounded-md bg-navy px-3 py-1.5 text-[12px] font-semibold text-white">
            Apply to certificate balance
          </button>
        </form>
      </div>

      <h2 className="mt-6 mb-3 text-[13px] font-semibold text-navy">Recent transactions</h2>
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        {company.billingTransactions.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-text-muted">No transactions.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-[10px] uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2 font-semibold">Date</th>
                  <th className="px-4 py-2 font-semibold">Type</th>
                  <th className="px-4 py-2 font-semibold">Qty</th>
                  <th className="px-4 py-2 font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {company.billingTransactions.map((t: (typeof company.billingTransactions)[number]) => (
                  <tr key={t.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2 text-text-muted">{t.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                    <td className="px-4 py-2 text-text-mid">{txnLabel(t.type)}</td>
                    <td className="px-4 py-2 tabular-nums text-text-mid">
                      {t.quantity > 0 ? `+${t.quantity}` : t.quantity}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-text-muted">${(t.amountCents / 100).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
