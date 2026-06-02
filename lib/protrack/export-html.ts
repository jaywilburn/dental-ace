/*
  Board-formatted CE compliance report as a self-contained HTML string (inline
  CSS, print-friendly). Rendered to PDF by the export route via Puppeteer.
  Pure function: no DB, no framework.
*/

export type ExportCert = {
  courseTitle: string;
  provider: string;
  category: string;
  hours: string;
  date: string;
  verified: string;
};

export type ExportData = {
  fullName: string;
  state: string;
  licenseType: string;
  licenseNumber: string;
  renewalDate: string;
  generatedAt: string;
  totalCompleted: string;
  totalRequired: string;
  remaining: string;
  isComplete: boolean;
  certs: ExportCert[];
  gaps: string[];
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderExportHtml(data: ExportData): string {
  const rows = data.certs
    .map(
      (c) => `
      <tr>
        <td>${escapeHtml(c.courseTitle)}</td>
        <td>${escapeHtml(c.provider)}</td>
        <td>${escapeHtml(c.category)}</td>
        <td class="num">${escapeHtml(c.hours)}</td>
        <td>${escapeHtml(c.date)}</td>
        <td>${escapeHtml(c.verified)}</td>
      </tr>`,
    )
    .join("");

  const summaryBanner = data.isComplete
    ? `<div class="banner ok">All ${escapeHtml(data.totalRequired)} required hours are complete.</div>`
    : `<div class="banner warn">CE record is not yet complete: ${escapeHtml(
        data.remaining,
      )} hours still needed${
        data.gaps.length
          ? ` (open categories: ${escapeHtml(data.gaps.join(", "))})`
          : ""
      }.</div>`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
        color: #0B1A2E; margin: 0; padding: 40px; font-size: 12px;
      }
      .head {
        display: flex; justify-content: space-between; align-items: flex-start;
        border-bottom: 2px solid #0B1A2E; padding-bottom: 14px; margin-bottom: 18px;
      }
      .brand { font-family: Georgia, "Times New Roman", serif; font-size: 22px; font-weight: 700; }
      .brand span { color: #C8971A; }
      .head .meta { text-align: right; font-size: 10px; color: #56708A; }
      h1 { font-size: 16px; margin: 0 0 4px 0; }
      .sub { color: #56708A; font-size: 11px; margin-bottom: 18px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-bottom: 18px; }
      .grid .row { display: flex; justify-content: space-between; border-bottom: 1px solid #CDD9EE; padding: 5px 0; }
      .grid .row .k { color: #56708A; }
      .grid .row .v { font-weight: 600; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th { background: #0B1A2E; color: #fff; text-align: left; font-size: 10px; padding: 7px 8px; text-transform: uppercase; letter-spacing: 0.5px; }
      td { padding: 7px 8px; border-bottom: 1px solid #CDD9EE; }
      td.num, th.num { text-align: right; }
      .banner { padding: 10px 14px; border-radius: 6px; font-weight: 600; font-size: 11px; }
      .banner.ok { background: #DCFCE7; color: #166534; }
      .banner.warn { background: #FEF3C7; color: #92400E; }
      .foot { margin-top: 24px; color: #6B87A8; font-size: 10px; border-top: 1px solid #CDD9EE; padding-top: 10px; }
    </style>
  </head>
  <body>
    <div class="head">
      <div class="brand">Pro<span>Track</span></div>
      <div class="meta">
        CE Compliance Report<br />
        ${escapeHtml(data.state)} State Board of Dental Examiners<br />
        Generated ${escapeHtml(data.generatedAt)}
      </div>
    </div>

    <h1>${escapeHtml(data.fullName)}</h1>
    <div class="sub">Continuing Education Compliance Record</div>

    <div class="grid">
      <div class="row"><span class="k">License Number</span><span class="v">${escapeHtml(data.licenseNumber)}</span></div>
      <div class="row"><span class="k">License Type</span><span class="v">${escapeHtml(data.licenseType)}</span></div>
      <div class="row"><span class="k">State</span><span class="v">${escapeHtml(data.state)}</span></div>
      <div class="row"><span class="k">Renewal Date</span><span class="v">${escapeHtml(data.renewalDate)}</span></div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Course</th><th>Provider</th><th>Category</th>
          <th class="num">Hours</th><th>Date</th><th>Verified</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="6">No certificates on file.</td></tr>`}</tbody>
    </table>

    ${summaryBanner}

    <div class="foot">
      ProTrack tracks continuing education hours and does not certify compliance.
      Confirm requirements with your state board. ProTrack, An AADB Program, dentalace.org
    </div>
  </body>
</html>`;
}
