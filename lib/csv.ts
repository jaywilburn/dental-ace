/*
  Shared CSV helpers for the export routes. Pure, unit-tested in lib/csv.test.ts.
*/

/*
  Quote + escape one CSV field. A leading =, +, -, @, tab or carriage return
  is neutralised with an apostrophe: spreadsheets treat those as the start of a
  formula (tab and CR are the variants that slip past a check on the first
  visible character), and attendee names, emails and survey answers are all
  user-supplied.
*/
export function csvField(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

/** One CSV line (no terminator) from raw field values. */
export function csvLine(values: readonly string[]): string {
  return values.map(csvField).join(",");
}
