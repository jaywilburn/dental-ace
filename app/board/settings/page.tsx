import { PageHeader } from "@/components/portal-shell";
import { requireBoard } from "@/lib/board/scope";

export default async function BoardSettingsPage() {
  const { board } = await requireBoard();
  return (
    <>
      <PageHeader
        title="Board settings"
        subtitle="Configure default audit parameters, deficiency deadlines, and notification preferences."
      />
      <div className="rounded-lg border border-border bg-white p-6">
        <dl className="grid gap-3 text-[12px]">
          <div className="flex items-baseline justify-between border-b border-border pb-3">
            <dt className="text-text-muted">Board name</dt>
            <dd className="font-medium text-navy">{board.name}</dd>
          </div>
          <div className="flex items-baseline justify-between border-b border-border pb-3">
            <dt className="text-text-muted">State</dt>
            <dd className="font-medium text-navy">{board.state}</dd>
          </div>
          <div className="flex items-baseline justify-between">
            <dt className="text-text-muted">Settings editor</dt>
            <dd className="text-text-muted">Shipping in the next Verify drop.</dd>
          </div>
        </dl>
      </div>
    </>
  );
}
