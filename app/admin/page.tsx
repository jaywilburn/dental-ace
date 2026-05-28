import { PageHeader } from "@/components/portal-shell";

export default function AdminDashboard() {
  return (
    <>
      <PageHeader
        title="Admin Dashboard"
        subtitle="Week 2 placeholder. Platform analytics, company management, and override tools land in Weeks 7 to 8."
      />
      <div className="rounded-lg border border-border bg-white p-6">
        <p className="text-sm text-text-mid">
          You are signed in as an ADMIN. From here you will provision companies,
          create reviewer + admin accounts, manage overrides, and onboard state
          boards once Verify is built in Phase 3.
        </p>
      </div>
    </>
  );
}
