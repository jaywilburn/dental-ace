/*
  Board-formatted audit batch report as a self-contained HTML string (inline
  CSS, print-friendly). Rendered to PDF by the export route via Puppeteer.
  Pure function: no DB, no framework. Mirrors the shape of
  lib/protrack/export-html.ts.
*/

export type AuditExportSelection = {
  licenseNumber: string;
  fullName: string;
  licenseType: string; // short label, "DDS" / "RDH" / "DA"
  ceHoursCompleted: string;
  ceHoursRequired: string;
  status: string; // "Compliant" / "In progress" / "Deficient" / "No upload"
  statusClass: "ok" | "progress" | "deficient" | "no-upload";
};

export type AuditExportData = {
  boardName: string;
  stateName: string;
  batchCode: string;
  auditName: string;
  renewalCycle: string;
  licenseTypeLabel: string; // "Dentist (DDS/DMD)" or "All license types"
  samplePercent: number;
  initiatedBy: string;
  runDate: string;
  generatedAt: string;
  selectedCount: number;
  compliantCount: number;
  inProgressCount: number;
  deficientCount: number;
  noUploadCount: number;
  selections: AuditExportSelection[];
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderAuditExportHtml(data: AuditExportData): string {
  const compliancePct =
    data.selectedCount === 0
      ? 0
      : Math.round((data.compliantCount / data.selectedCount) * 100);

  const rows = data.selections
    .map(
      (s) => `
      <tr>
        <td class="mono">${escapeHtml(s.licenseNumber)}</td>
        <td>${escapeHtml(s.fullName)}</td>
        <td>${escapeHtml(s.licenseType)}</td>
        <td class="num">${escapeHtml(s.ceHoursCompleted)}</td>
        <td class="num">${escapeHtml(s.ceHoursRequired)}</td>
        <td><span class="pill pill-${s.statusClass}">${escapeHtml(s.status)}</span></td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
        color: #0B1A2E; margin: 0; padding: 36px; font-size: 11px;
      }
      .head {
        display: flex; justify-content: space-between; align-items: flex-start;
        border-bottom: 2px solid #0B1A2E; padding-bottom: 14px; margin-bottom: 18px;
      }
      .brand { font-family: Georgia, "Times New Roman", serif; font-size: 22px; font-weight: 700; }
      .brand span { color: #2563EB; }
      .head .meta { text-align: right; font-size: 10px; color: #56708A; }
      h1 { font-size: 16px; margin: 0 0 4px 0; }
      .sub { color: #56708A; font-size: 11px; margin-bottom: 18px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-bottom: 18px; }
      .grid .row { display: flex; justify-content: space-between; border-bottom: 1px solid #CDD9EE; padding: 5px 0; }
      .grid .row .k { color: #56708A; }
      .grid .row .v { font-weight: 600; }
      .stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 18px; }
      .stat {
        border: 1px solid #CDD9EE; border-radius: 6px; padding: 10px 12px;
      }
      .stat .label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.6px; color: #56708A; }
      .stat .value { font-size: 18px; font-weight: 700; margin-top: 2px; }
      .stat .meta { font-size: 9px; color: #6B87A8; margin-top: 2px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th { background: #0B1A2E; color: #fff; text-align: left; font-size: 9px; padding: 7px 8px; text-transform: uppercase; letter-spacing: 0.5px; }
      td { padding: 7px 8px; border-bottom: 1px solid #CDD9EE; font-size: 10px; }
      td.num, th.num { text-align: right; }
      td.mono { font-family: "SF Mono", Consolas, Menlo, monospace; font-size: 9.5px; }
      .pill {
        display: inline-block; padding: 2px 7px; border-radius: 999px;
        font-size: 9px; font-weight: 700;
      }
      .pill-ok { background: #DCFCE7; color: #166534; }
      .pill-progress { background: #FEF3C7; color: #92400E; }
      .pill-deficient { background: #FEE2E2; color: #991B1B; }
      .pill-no-upload { background: #F3F4F6; color: #4B5563; }
      .foot { margin-top: 24px; color: #6B87A8; font-size: 9px; border-top: 1px solid #CDD9EE; padding-top: 10px; }
      @page { size: Letter; margin: 0; }
    </style>
  </head>
  <body>
    <div class="head">
      <div class="brand">Veri<span>fy</span></div>
      <div class="meta">
        State Board CE Audit Report<br />
        ${escapeHtml(data.boardName)}<br />
        Generated ${escapeHtml(data.generatedAt)}
      </div>
    </div>

    <h1>${escapeHtml(data.auditName)}</h1>
    <div class="sub">
      Batch ${escapeHtml(data.batchCode)} · Run ${escapeHtml(data.runDate)} ·
      ${escapeHtml(data.stateName)}
    </div>

    <div class="grid">
      <div class="row"><span class="k">License type</span><span class="v">${escapeHtml(data.licenseTypeLabel)}</span></div>
      <div class="row"><span class="k">Renewal cycle</span><span class="v">${escapeHtml(data.renewalCycle)}</span></div>
      <div class="row"><span class="k">Sample size</span><span class="v">${data.samplePercent}%</span></div>
      <div class="row"><span class="k">Initiated by</span><span class="v">${escapeHtml(data.initiatedBy)}</span></div>
    </div>

    <div class="stats">
      <div class="stat">
        <div class="label">Selected</div>
        <div class="value">${data.selectedCount}</div>
        <div class="meta">Total in sample</div>
      </div>
      <div class="stat">
        <div class="label">Compliant</div>
        <div class="value">${data.compliantCount}</div>
        <div class="meta">${compliancePct}% of sample</div>
      </div>
      <div class="stat">
        <div class="label">In progress</div>
        <div class="value">${data.inProgressCount}</div>
        <div class="meta">Partial credit</div>
      </div>
      <div class="stat">
        <div class="label">Deficient</div>
        <div class="value">${data.deficientCount}</div>
        <div class="meta">Notices required</div>
      </div>
      <div class="stat">
        <div class="label">No upload</div>
        <div class="value">${data.noUploadCount}</div>
        <div class="meta">Zero verified hours</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>License #</th><th>Name</th><th>Type</th>
          <th class="num">Completed</th><th class="num">Required</th><th>Status</th>
        </tr>
      </thead>
      <tbody>${
        rows ||
        `<tr><td colspan="6" style="text-align:center; color:#56708A; padding:18px;">No selections in this batch.</td></tr>`
      }</tbody>
    </table>

    <div class="foot">
      Verify is an AADB program supporting state-board random CE audits. This
      report snapshots CE compliance for the selected licensees at the time of
      the audit run. Subsequent uploads do not alter recorded snapshots.
      ${escapeHtml(data.boardName)} · dentalace.org
    </div>
  </body>
</html>`;
}
