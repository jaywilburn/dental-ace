/*
  Backfill the QR + approval-letter asset paths for migrated legacy courses.

  Background: scripts/migrate-legacy.ts was data-load only — it never recorded
  qr_code_url / approval_letter_url on the imported accredited_courses rows, so
  My Courses shows "QR unavailable" / "Letter unavailable" for every legacy
  course. The app's self-heal (lib/courses/course-assets.ts) regenerates a
  missing OBJECT on demand, but only when the row has a PATH recorded; a null
  path is never healed. This script records the same deterministic paths the
  approve action uses (lib/reviewer/accredit.ts):

    qr_code_url         = qrcodes/<application_id>.png
    approval_letter_url = approval-letters/<application_id>.pdf

  The letter PDF's content is URL-independent, so its object is intentionally
  left to the self-heal on first view. The QR is NOT: it encodes the attend
  URL, and the dev fallback in appBaseUrl() would bake localhost into any QR
  healed during local development (this exact bug shipped once already). So
  this script renders and uploads the QR PNGs itself, pinned to the canonical
  production origin (override with --base-url=...; non-https and localhost
  origins are refused).

  The QR render options and storage call mirror lib/qrcode.ts and
  lib/storage.ts, which can't be imported here: they are "server-only" and use
  "@/" path aliases, neither of which loads under tsx.

  Targets are absolute and uploads are upsert, so re-running is a no-op for
  rows already backfilled. Matching is on legacy_id — natively accredited
  courses are never touched.

  Usage:
    pnpm backfill:course-assets                          dry run (default): print the plan, write nothing
    pnpm backfill:course-assets --apply                  upload QRs + record paths
    pnpm backfill:course-assets --apply --base-url=URL   override the QR origin (must be https, not localhost)
*/
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import QRCode from "qrcode";

config({ path: ".env.local" });

const DEFAULT_BASE_URL = "https://www.dentalace.org";
const UPLOADS_BUCKET = process.env.SUPABASE_STORAGE_BUCKET_UPLOADS ?? "uploads";

// Mirrors lib/qrcode.ts renderQrPng (navy-on-white, 600px, M correction).
function renderQrPng(targetUrl: string): Promise<Buffer> {
  return QRCode.toBuffer(targetUrl, {
    errorCorrectionLevel: "M",
    type: "png",
    width: 600,
    margin: 2,
    color: {
      dark: "#0B1A2E",
      light: "#FFFFFF",
    },
  });
}

function pad(s: string | number, w: number): string {
  const str = String(s);
  return str.length >= w ? str : str + " ".repeat(w - str.length);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const baseArg = args.find((a) => a.startsWith("--base-url="));
  const baseUrl = (baseArg ? baseArg.slice("--base-url=".length) : DEFAULT_BASE_URL).replace(/\/+$/, "");

  const parsedBase = new URL(baseUrl); // throws on garbage
  if (parsedBase.protocol !== "https:" || /localhost|127\.0\.0\.1/.test(parsedBase.hostname)) {
    throw new Error(
      `Refusing QR origin "${baseUrl}" — QRs are long-lived printed assets and must point at the public https origin.`,
    );
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  const host = (() => {
    try {
      return new URL(dbUrl).host;
    } catch {
      return "unknown";
    }
  })();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (storage upload needs the service role).");
  }

  // Plain Storage REST calls: supabase-js's createClient eagerly constructs a
  // realtime WebSocket client, which Node 20 under tsx does not have.
  const authHeaders = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
  const uploadQr = async (path: string, body: Buffer): Promise<void> => {
    const res = await fetch(`${supabaseUrl}/storage/v1/object/${UPLOADS_BUCKET}/${path}`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "image/png", "x-upsert": "true" },
      body: new Uint8Array(body),
    });
    if (!res.ok) throw new Error(`QR upload failed (${path}): ${res.status} ${await res.text()}`);
  };
  const signUrl = async (path: string): Promise<void> => {
    const res = await fetch(`${supabaseUrl}/storage/v1/object/sign/${UPLOADS_BUCKET}/${path}`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 300 }),
    });
    if (!res.ok) throw new Error(`Post-apply signed-URL check failed (${path}): ${res.status} ${await res.text()}`);
  };

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) });
  try {
    console.log(`Target DB: ${host}  |  bucket: ${UPLOADS_BUCKET}  |  QR origin: ${baseUrl}  |  mode: ${apply ? "APPLY" : "dry run"}\n`);

    const courses = await prisma.accreditedCourse.findMany({
      where: { legacyId: { not: null } },
      select: {
        id: true,
        legacyId: true,
        courseIdNumber: true,
        applicationId: true,
        attendeeLinkToken: true,
        qrCodeUrl: true,
        approvalLetterUrl: true,
      },
      orderBy: { legacyId: "asc" },
    });
    if (courses.length === 0) {
      console.log("No legacy courses found (legacy_id is null everywhere) — nothing to do.");
      return;
    }

    const plan = courses.map((c) => {
      const qrPath = `qrcodes/${c.applicationId}.png`;
      const letterPath = `approval-letters/${c.applicationId}.pdf`;
      const changed = c.qrCodeUrl !== qrPath || c.approvalLetterUrl !== letterPath;
      return { ...c, qrPath, letterPath, changed };
    });

    console.log(`${pad("legacyId", 10)}${pad("courseId", 16)}${pad("qr_code_url", 14)}${pad("letter_url", 14)}action`);
    console.log("-".repeat(70));
    for (const r of plan) {
      console.log(
        `${pad(r.legacyId!, 10)}${pad(r.courseIdNumber, 16)}${pad(r.qrCodeUrl ? "recorded" : "null", 14)}${pad(r.approvalLetterUrl ? "recorded" : "null", 14)}${r.changed ? "record paths + upload QR" : "already correct"}`,
      );
    }

    const changes = plan.filter((r) => r.changed);
    console.log(`\nSummary: ${plan.length} legacy courses · ${changes.length} to backfill · ${plan.length - changes.length} already correct`);
    console.log("Letter PDFs are not uploaded here: the recorded path lets lib/courses/course-assets.ts render each one on first view (content is origin-independent).");

    if (!apply) {
      console.log(`\nDry run — nothing written. Re-run with --apply to commit ${changes.length} change(s).`);
      return;
    }
    if (changes.length === 0) {
      console.log("\nNothing to apply.");
      return;
    }

    // Upload each QR first, then record the row's paths — a mid-run failure
    // leaves untouched rows fully null (still "unavailable", still re-runnable)
    // rather than paths pointing at objects that were never attempted.
    let done = 0;
    for (const r of changes) {
      const qrPng = await renderQrPng(`${baseUrl}/attend/${r.attendeeLinkToken}`);
      await uploadQr(r.qrPath, qrPng);
      await prisma.accreditedCourse.update({
        where: { id: r.id },
        data: { qrCodeUrl: r.qrPath, approvalLetterUrl: r.letterPath },
      });
      done++;
      if (done % 20 === 0) console.log(`  ...${done}/${changes.length}`);
    }
    console.log(`\nApplied ${done} change(s): ${done} QR PNGs uploaded, ${done} rows updated.`);

    // Smoke check: sign the first backfilled QR so a bad bucket/key fails loudly here.
    await signUrl(changes[0].qrPath);
    console.log(`Signed-URL check OK for ${changes[0].qrPath}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
