import { NextResponse, type NextRequest } from "next/server";
import { verifyCertClaimToken } from "@/lib/protrack/cert-claim-token";
import { claimIssuedCertificate } from "@/lib/protrack/ace-sync";

/*
  GET /api/protrack/claim-certificate?token=... — the "Add this certificate to
  ProTrack" link in the certificate-issued email.

  The signed token is mailed only to the attendee's own attendeeEmail, so
  possession of this link proves the clicker controls that inbox. That is the
  authorization to attach the cert to the ProTrack account owning the email (the
  "email proven before a cert is attached" gate; see lib/protrack/ace-sync.ts).
  No session is required or trusted: the cert only ever lands in the account
  whose email matches the cert's own attendeeEmail, so even a forwarded link
  can't misattribute it.

  Idempotent (attach dedupes on the unique issuedCertificateId), so email-scanner
  prefetches and re-clicks are safe. Same-origin redirects, so they can use the
  request origin (no emailed URL is built here).
*/

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const token = request.nextUrl.searchParams.get("token") ?? "";

  const certId = verifyCertClaimToken(token);
  if (!certId) {
    return NextResponse.redirect(`${origin}/login?error=cert_claim`, 303);
  }

  const result = await claimIssuedCertificate(certId);

  if (result.status === "no_account") {
    // No ProTrack account owns this email yet: send them to sign up prefilled.
    // Their verification backfill (syncIssuedCertsForLicensee) attaches this
    // cert, and any others for the email, once they confirm ownership.
    return NextResponse.redirect(
      `${origin}/signup?email=${encodeURIComponent(result.email)}`,
      303,
    );
  }

  if (result.status === "invalid") {
    return NextResponse.redirect(`${origin}/login?error=cert_claim`, 303);
  }

  // Attached. The /protrack area guard signs them in if needed, then shows it.
  return NextResponse.redirect(`${origin}/protrack?claimed=1`, 303);
}
