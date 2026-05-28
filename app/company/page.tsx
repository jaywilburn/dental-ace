import { PageHeader } from "@/components/portal-shell";

export default function CompanyDashboard() {
  return (
    <>
      <PageHeader
        title="Company Dashboard"
        subtitle="Week 2 placeholder. Real stats, activity feed, and balance widget land in Weeks 3 to 6."
      />
      <div className="rounded-lg border border-border bg-white p-6">
        <p className="text-sm text-text-mid">
          You are signed in as a CUSTOMER. Sidebar links go to placeholders for
          now; the application form, certificate log, and billing pages get
          wired up in the next phases.
        </p>
      </div>
    </>
  );
}
