import { PageHeader } from "@/components/portal-shell";
import { requireBoard } from "@/lib/board/scope";

export default async function NewAuditPage() {
  await requireBoard();
  return (
    <>
      <PageHeader
        title="Run a random audit"
        subtitle="Pick a sample size and license type. Verify snapshots CE compliance for the selected licensees."
      />
      <ComingSoon page="New audit configurator" />
    </>
  );
}

function ComingSoon({ page }: { page: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-white p-8 text-center">
      <p className="font-serif text-base font-semibold text-navy">{page}</p>
      <p className="mt-1 text-[12px] text-text-muted">
        Shipping in the next Verify drop.
      </p>
    </div>
  );
}
