import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renderApplicationWorksheetPdf } from "@/lib/pdf/application-worksheet";

/*
  Regenerates public/application-overview.pdf (the downloadable Course
  Application Worksheet linked from app/company/applications/new/page.tsx and
  the company sidebar nav). The PDF is a build artifact: edit the question list
  in lib/pdf/application-worksheet.ts, then run `pnpm build:worksheet` and
  commit the regenerated file. Run via tsx (same runner as the seed scripts).
*/
async function main(): Promise<void> {
  const buf = await renderApplicationWorksheetPdf();
  const outPath = join(process.cwd(), "public", "application-overview.pdf");
  await writeFile(outPath, buf);
  console.log(`Wrote ${outPath} (${buf.length.toLocaleString()} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
