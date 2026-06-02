import { PageHeader } from "@/components/portal-shell";
import { requireBoard } from "@/lib/board/scope";

export default async function DeficienciesPage() {
  await requireBoard();
  return (
    <>
      <PageHeader
        title="Deficiencies"
        subtitle="Open deficiencies across all of your board's audits. Track resolution."
      />
      <ComingSoon page="Deficiency tracker" />
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
