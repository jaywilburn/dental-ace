import { PageHeader } from "@/components/portal-shell";
import { requireProtrackPro } from "@/lib/protrack/require-pro";

/*
  Pro-gated audit-ready export. The Download button hits the export route, which
  streams a board-formatted PDF; the preview iframe renders the same report as
  HTML. Mirrors logic/protrack-dev-mockup-suite.html #export.
*/
export default async function ExportPage() {
  await requireProtrackPro();

  return (
    <>
      <PageHeader
        title="Audit-Ready Export"
        subtitle="A board-formatted CE compliance report with every certificate listed."
        action={
          <a
            href="/api/protrack/export"
            className="rounded-md bg-navy px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-navy/90"
          >
            ↓ Download PDF
          </a>
        }
      />

      <p className="mb-4 rounded-md border border-ver/30 bg-ver-bg px-3 py-2 text-[11px] text-ver-dark text-pretty">
        Generate this whenever your board requests proof of continuing education.
        ProTrack tracks your hours; it does not certify compliance, so confirm
        requirements with your state board.
      </p>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <div className="border-b border-border bg-surface px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          Preview
        </div>
        <iframe
          title="CE compliance report preview"
          src="/api/protrack/export?format=html"
          className="h-[640px] w-full"
        />
      </div>
    </>
  );
}
