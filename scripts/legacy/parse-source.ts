/*
  Dependency-free parser for the client-delivered `dentalace_migration_v3.sql`.

  That file is a set of `INSERT INTO <table> (<cols>) VALUES (...), (...);`
  statements. It targets a *simplified, assumed* schema (integer PKs, a flat
  `certificates` table) that does NOT match our real Prisma schema, so we never
  run it — we parse it as a dataset and transform it (see scripts/migrate-legacy.ts).

  The SQL is Postgres-idiomatic: values may be single-quoted strings (with `''`
  escapes), `NULL`, numbers, `ARRAY['a','b']::text[]` constructors, and typed
  literals like `'2026-05-20'::date`. The tokenizer handles all of these. Each
  value comes back as a string (arrays as a JSON string like `["a","b"]`), or
  null for SQL NULL. All downstream typing/normalization happens in normalize.ts.
*/

export type RawRow = Record<string, string | null>;

export type ParsedTable = {
  columns: string[];
  rows: RawRow[];
};

/** One entry per legacy table we care about. */
export type ParsedSource = {
  companies: ParsedTable;
  courses: ParsedTable;
  certificates: ParsedTable;
};

// Maps the `INSERT INTO <name>` table name in the SQL to our result key.
const TABLE_KEYS: Record<string, keyof ParsedSource> = {
  companies: "companies",
  accredited_courses: "courses",
  certificates: "certificates",
};

function skipWs(sql: string, i: number): number {
  while (i < sql.length && /\s/.test(sql[i])) i += 1;
  return i;
}

/**
 * Read a single-quoted SQL string starting at `sql[i]` (which must be `'`).
 * Returns the unescaped content and the index just past the closing quote.
 */
function readQuoted(sql: string, i: number): { value: string; next: number } {
  let out = "";
  let j = i + 1; // past opening quote
  while (j < sql.length) {
    const ch = sql[j];
    if (ch === "'") {
      if (sql[j + 1] === "'") {
        out += "'"; // '' -> escaped single quote
        j += 2;
        continue;
      }
      return { value: out, next: j + 1 }; // closing quote
    }
    out += ch;
    j += 1;
  }
  throw new Error(`Unterminated string literal near index ${i}`);
}

/**
 * Read a Postgres `ARRAY[ 'a', 'b' ]` constructor starting at `sql[i]`.
 * Returns a JSON-array string of the (string) elements.
 */
function readArray(sql: string, i: number): { value: string; next: number } {
  let j = i + "ARRAY[".length; // caller ensured the prefix
  const elems: string[] = [];
  j = skipWs(sql, j);
  while (j < sql.length && sql[j] !== "]") {
    if (sql[j] === "'") {
      const r = readQuoted(sql, j);
      elems.push(r.value);
      j = r.next;
    } else if (sql[j] === "," || /\s/.test(sql[j])) {
      j += 1;
    } else {
      // bareword element (e.g. NULL) — read until , or ]
      let t = "";
      while (j < sql.length && sql[j] !== "," && sql[j] !== "]") {
        t += sql[j];
        j += 1;
      }
      const tt = t.trim();
      if (tt && tt.toUpperCase() !== "NULL") elems.push(tt);
    }
  }
  if (sql[j] !== "]") throw new Error(`Unterminated ARRAY near index ${i}`);
  return { value: JSON.stringify(elems), next: j + 1 };
}

/** Skip any `::type` cast suffix(es), including a trailing `[]`. */
function skipCasts(sql: string, i: number): number {
  let j = skipWs(sql, i);
  while (sql[j] === ":" && sql[j + 1] === ":") {
    j += 2;
    while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j])) j += 1; // type name
    while (sql[j] === "[" && sql[j + 1] === "]") j += 2; // array type
    j = skipWs(sql, j);
  }
  return j;
}

/** Read one field value starting at (or before) `sql[i]`. */
function readValue(sql: string, i: number): { value: string | null; next: number } {
  let j = skipWs(sql, i);
  let value: string | null;
  let next: number;
  if (sql[j] === "'") {
    const r = readQuoted(sql, j);
    value = r.value;
    next = r.next;
  } else if (/^ARRAY\[/i.test(sql.slice(j, j + 6))) {
    const r = readArray(sql, j);
    value = r.value;
    next = r.next;
  } else {
    // bareword: number / NULL / keyword, until a delimiter or cast
    let t = "";
    while (
      j < sql.length &&
      sql[j] !== "," &&
      sql[j] !== ")" &&
      !/\s/.test(sql[j]) &&
      !(sql[j] === ":" && sql[j + 1] === ":")
    ) {
      t += sql[j];
      j += 1;
    }
    const tt = t.trim();
    value = tt.toUpperCase() === "NULL" || tt === "" ? null : tt;
    next = j;
  }
  return { value, next: skipCasts(sql, next) };
}

/**
 * Parse one `( ... )` tuple beginning at `sql[i]` (which must be `(`).
 * Returns the field values and the index just past the closing `)`.
 */
function readTuple(sql: string, i: number): { fields: (string | null)[]; next: number } {
  const fields: (string | null)[] = [];
  let j = skipWs(sql, i + 1); // past "("
  while (true) {
    const r = readValue(sql, j);
    fields.push(r.value);
    j = skipWs(sql, r.next);
    if (sql[j] === ",") {
      j = skipWs(sql, j + 1);
      continue;
    }
    if (sql[j] === ")") return { fields, next: j + 1 };
    throw new Error(
      `Expected "," or ")" at index ${j}, got ${JSON.stringify(sql[j])}`,
    );
  }
}

/** Parse the parenthesized column list after `INSERT INTO <table>`. */
function parseColumnList(list: string): string[] {
  return list
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * Parse the delivered migration SQL text into the three legacy tables.
 * There are multiple `INSERT INTO certificates` statements (batched 500 rows
 * each); rows from all of them are concatenated.
 */
export function parseMigrationSql(sql: string): ParsedSource {
  const result: ParsedSource = {
    companies: { columns: [], rows: [] },
    courses: { columns: [], rows: [] },
    certificates: { columns: [], rows: [] },
  };

  const headerRe = /INSERT\s+INTO\s+([a-z_]+)\s*\(([^)]*)\)\s*VALUES/gi;
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(sql)) !== null) {
    const tableName = m[1].toLowerCase();
    const key = TABLE_KEYS[tableName];
    if (!key) continue; // ignore tables we don't import
    const columns = parseColumnList(m[2]);
    const table = result[key];
    if (table.columns.length === 0) table.columns = columns;

    // Walk tuples right after "VALUES" until the terminating ";".
    let i = headerRe.lastIndex;
    while (i < sql.length) {
      while (i < sql.length && (/\s/.test(sql[i]) || sql[i] === ",")) i += 1;
      if (i >= sql.length || sql[i] === ";") {
        i += 1;
        break;
      }
      if (sql[i] !== "(") break; // next statement / not a tuple
      const { fields, next } = readTuple(sql, i);
      if (fields.length !== columns.length) {
        throw new Error(
          `Row has ${fields.length} fields but ${columns.length} columns in "${tableName}" near index ${i}`,
        );
      }
      const row: RawRow = {};
      columns.forEach((col, idx) => (row[col] = fields[idx]));
      table.rows.push(row);
      i = next;
    }
    headerRe.lastIndex = i; // continue scanning from where we stopped
  }

  return result;
}
