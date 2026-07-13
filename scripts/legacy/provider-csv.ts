/*
  Parse + validate the CE-provider provisioning CSV consumed by
  scripts/provision-legacy-providers.ts. The legacy migration loaded 39 CE-provider
  companies but carries NO provider emails, so the client fills in a sheet keyed by
  each company's legacy_id:

    legacy_id,company_name,owner_email,owner_first,owner_last

  Kept dependency-free and pure (no DB, no fs) so it is unit-testable in isolation
  (scripts/legacy/provider-csv.test.ts), mirroring scripts/legacy/name-split.ts. The
  provision script reads the file and hands the text here; the Company lookup by
  legacy_id and the name-mismatch check happen against the DB at run time, the latter
  via companyNamesMatch below.
*/

export type ProviderCsvRow = {
  legacyId: number;
  companyName: string;
  ownerEmail: string;
  ownerFirst: string;
  ownerLast: string;
  lineNo: number;
};

export type ProviderCsvSkip = {
  lineNo: number;
  raw: string;
  reason: string;
};

export type ProviderCsvParseResult = {
  rows: ProviderCsvRow[];
  skipped: ProviderCsvSkip[];
};

// Basic deliverability gate, identical to the invite scripts' looksValid: reject
// anything without a single @ and a dotted domain, so a bad row never reaches
// Supabase Auth.
export function isValidProviderEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

// Trimmed, case-insensitive company-name comparison used to flag a mis-filled row
// (the CSV company_name should match the pre-loaded Company name).
export function companyNamesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Split one CSV line into trimmed fields, honoring double-quoted fields (which may
// contain commas) and "" escapes, so a name like "Pearl, Inc." survives intact.
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields.map((f) => f.trim());
}

export function parseProvidersCsv(text: string): ProviderCsvParseResult {
  const rows: ProviderCsvRow[] = [];
  const skipped: ProviderCsvSkip[] = [];

  const rawLines = text.split(/\r?\n/);
  let headerHandled = false;

  rawLines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) return;

    const cells = splitCsvLine(rawLine);
    const legacyIdCell = cells[0] ?? "";

    // Only the first non-blank, non-comment line is eligible to be a header: if its
    // first cell is not a positive integer, drop it once. Every later non-numeric
    // first cell is a malformed data row and is reported as skipped.
    if (!headerHandled) {
      headerHandled = true;
      if (!/^\d+$/.test(legacyIdCell)) return;
    }

    if (cells.length < 5) {
      skipped.push({ lineNo, raw: line, reason: `expected 5 columns, got ${cells.length}` });
      return;
    }

    const legacyId = Number(legacyIdCell);
    if (!Number.isInteger(legacyId) || legacyId <= 0) {
      skipped.push({ lineNo, raw: line, reason: `bad legacy_id "${legacyIdCell}"` });
      return;
    }

    const companyName = cells[1] ?? "";
    const ownerEmail = cells[2] ?? "";
    const ownerFirst = cells[3] ?? "";
    const ownerLast = cells[4] ?? "";

    if (ownerEmail.length === 0) {
      skipped.push({ lineNo, raw: line, reason: "blank owner_email" });
      return;
    }
    if (!isValidProviderEmail(ownerEmail)) {
      skipped.push({ lineNo, raw: line, reason: `invalid owner_email "${ownerEmail}"` });
      return;
    }

    rows.push({ legacyId, companyName, ownerEmail, ownerFirst, ownerLast, lineNo });
  });

  return { rows, skipped };
}
