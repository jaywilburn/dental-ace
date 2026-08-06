import "server-only";

/*
  Canonical base URL for links that leave the server (emails especially).

  Pinned to NEXT_PUBLIC_APP_URL so a spoofed `Host` header cannot point a
  verification/reset link at an attacker domain (host-header injection → token
  capture). In production we never fall back to the request host; in dev we use
  the request origin for convenience.

  Use ONLY for outbound/emailed URLs. Plain server redirects back to the same
  origin can keep using the request origin (a spoofed host there only redirects
  the attacker's own request).

  requestOrigin is optional for callers with no request in scope (server
  actions, background jobs): production still pins to NEXT_PUBLIC_APP_URL or
  the canonical domain, and dev falls back to localhost.
*/
export function appBaseUrl(requestOrigin?: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") return "https://www.dentalace.org";
  return requestOrigin ?? "http://localhost:3000";
}
