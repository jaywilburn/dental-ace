import { PageHeader } from "@/components/portal-shell";

export default function ReviewerQueue() {
  return (
    <>
      <PageHeader
        title="Application Queue"
        subtitle="Week 2 placeholder. The queue, slide-in review panel, and approve/reject flows ship in Weeks 3 to 4."
      />
      <div className="rounded-lg border border-border bg-white p-6">
        <p className="text-sm text-text-mid">
          You are signed in as a REVIEWER. When an application is submitted,
          it will appear here with all 34 fields available for review.
        </p>
      </div>
    </>
  );
}
