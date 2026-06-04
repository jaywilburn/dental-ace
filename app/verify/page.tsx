import Link from "next/link";
import { headers } from "next/headers";
import { BrandMark } from "@/components/brand-mark";
import { lookupCertificates, type VerifyMode } from "@/lib/verify/lookup";
import { checkRateLimit, rateLimitKeyFromHeaders } from "@/lib/verify/rate-limit";

/*
  Public certificate-verification page. No auth — anyone (employer, insurer,
  attendee) can confirm a CE certificate.

  Search modes:
   - license: enter a license number
   - name: enter "First Last"
   - cert: enter a cert number (CeCertificate.cert_number or IssuedCertificate id)

  The form GETs to /verify with the params so results are linkable but no PII
  leaves the user's address bar that they didn't type themselves. Rate limit is
  applied per-IP (lib/verify/rate-limit.ts).
*/

export const dynamic = "force-dynamic"; // headers() opts out of static rendering anyway

const fieldClass =
  "w-full rounded-md border border-white/15 bg-white/[0.04] px-3 py-2.5 text-[14px] text-white placeholder:text-white/30 outline-none focus:border-ace";

const MODE_LABELS: Record<VerifyMode, string> = {
  license: "License #",
  name: "Name",
  cert: "Certificate #",
};

const MODE_PLACEHOLDERS: Record<VerifyMode, string> = {
  license: "e.g. TX-DDS_DMD-100042",
  name: "First Last (both required, ≥3 chars each)",
  cert: "e.g. ACE-2026-00042 or cert number from your record",
};

function isStrictNameInput(value: string): boolean {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return false;
  const first = tokens[0]!;
  const last = tokens.slice(1).join(" ");
  return first.length >= 3 && last.length >= 3;
}

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; q?: string }>;
}) {
  const { mode: modeParam, q: rawQ } = await searchParams;
  const mode: VerifyMode =
    modeParam === "name" || modeParam === "cert" ? modeParam : "license";
  const q = (rawQ ?? "").trim();
  const hasQuery = q.length > 0;

  let results: Awaited<ReturnType<typeof lookupCertificates>> = [];
  let limitState: ReturnType<typeof checkRateLimit> | null = null;
  const nameNeedsRefinement = mode === "name" && hasQuery && !isStrictNameInput(q);

  if (hasQuery && !nameNeedsRefinement) {
    const reqHeaders = await headers();
    limitState = checkRateLimit(
      `verify:${rateLimitKeyFromHeaders(reqHeaders)}`,
    );
    if (limitState.ok) {
      results = await lookupCertificates(mode, q);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center bg-navy px-4 py-12">
      <div className="w-full max-w-2xl text-center text-white">
        <BrandMark tag="AADB" product="ver" size="lg" />
        <h1 className="mt-4 font-serif text-3xl font-bold text-balance">
          Verify a CE Certificate
        </h1>
        <p className="mx-auto mt-2 max-w-md text-[13px] text-white/55 text-pretty">
          Confirm continuing-education certificates issued through DentalACE or
          tracked in ProTrack. Free, no account required.
        </p>
      </div>

      <form
        method="GET"
        action="/verify"
        className="mt-8 w-full max-w-2xl space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-5"
      >
        <div className="flex flex-wrap gap-1">
          {(Object.keys(MODE_LABELS) as VerifyMode[]).map((m) => (
            <label
              key={m}
              className={
                "cursor-pointer rounded-full border px-3 py-1 text-[11px] font-semibold transition " +
                (mode === m
                  ? "border-ver bg-ver/20 text-white"
                  : "border-white/15 bg-transparent text-white/55 hover:text-white")
              }
            >
              <input
                type="radio"
                name="mode"
                value={m}
                defaultChecked={mode === m}
                className="sr-only"
              />
              {MODE_LABELS[m]}
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder={MODE_PLACEHOLDERS[mode]}
            className={fieldClass}
            autoFocus
            minLength={2}
            maxLength={120}
            required
          />
          <button
            type="submit"
            className="rounded-md bg-ver px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-ver/90"
          >
            Verify
          </button>
        </div>
      </form>

      <section className="mt-8 w-full max-w-2xl">
        {nameNeedsRefinement ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-6 text-center">
            <p className="text-[14px] font-semibold text-white">
              Refine your search
            </p>
            <p className="mt-1 text-[12px] text-white/55 text-pretty">
              Name lookups require both a first and last name, each at least
              three letters. To avoid name-only directory scraping we don&apos;t
              return partial matches. Try license number or certificate number
              for the most accurate results.
            </p>
          </div>
        ) : hasQuery && limitState && !limitState.ok ? (
          <p className="rounded-lg border border-red-200/20 bg-red-50/5 p-5 text-center text-[13px] text-white/70">
            Too many lookups from this address. Try again after{" "}
            {limitState.resetAt.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}
            .
          </p>
        ) : hasQuery && results.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-6 text-center">
            <p className="text-[14px] font-semibold text-white">
              No matching certificates
            </p>
            <p className="mt-1 text-[12px] text-white/55 text-pretty">
              Double-check the value and the search mode. If the certificate is
              real but isn&apos;t in our records, the issuer may not yet be a
              DentalACE accredited provider.
            </p>
          </div>
        ) : results.length > 0 ? (
          <>
            <p className="mb-2 text-[11px] uppercase tracking-[2px] text-white/40">
              {results.length} result{results.length === 1 ? "" : "s"}
            </p>
            <ul className="space-y-2">
              {results.map((hit, i) => (
                <li
                  key={`${hit.source}-${hit.certNumber ?? i}-${hit.completedAt.toISOString()}`}
                  className="rounded-lg border border-white/10 bg-white/[0.04] p-4 text-left"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-serif text-base font-semibold text-white">
                      {hit.courseTitle}
                    </p>
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                        (hit.source === "DENTAL_ACE_ISSUED" ||
                        hit.verificationLabel === "AADB Issued"
                          ? "bg-ace/20 text-ace-light"
                          : "bg-ver/20 text-white")
                      }
                    >
                      {hit.verificationLabel}
                    </span>
                  </div>
                  <dl className="mt-2 grid gap-1 text-[12px] sm:grid-cols-2">
                    <Row label="Attendee" value={hit.attendeeName} />
                    <Row label="License #" value={hit.licenseNumber ?? "—"} />
                    <Row label="CE Hours" value={hit.ceHours.toFixed(1)} />
                    <Row
                      label="Completed"
                      value={hit.completedAt.toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    />
                    {hit.category ? (
                      <Row label="Category" value={hit.category} />
                    ) : null}
                    {hit.certNumber ? (
                      <Row label="Cert #" value={hit.certNumber} mono />
                    ) : null}
                  </dl>
                  <p className="mt-3 border-t border-white/10 pt-3 text-[11px] text-white/45">
                    {hit.provenance}
                  </p>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <footer className="mt-12 text-center text-[11px] text-white/40">
        <Link href="/verify/contact" className="text-ver hover:underline">
          For state boards
        </Link>
        <span className="mx-2">·</span>
        <Link href="/" className="hover:text-white/60">
          DentalACE One
        </Link>
      </footer>
    </main>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2 text-white/70">
      <dt className="text-white/45">{label}</dt>
      <dd className={mono ? "font-mono text-white" : "font-medium text-white"}>
        {value}
      </dd>
    </div>
  );
}
