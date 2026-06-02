import { PageHeader } from "@/components/portal-shell";
import { requireBoard } from "@/lib/board/scope";

export default async function NoticesPage() {
  await requireBoard();
  return (
    <>
      <PageHeader
        title="Notices"
        subtitle="History of deficiency notices sent to licensees from your board."
      />
      <ComingSoon page="Notice ledger" />
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
