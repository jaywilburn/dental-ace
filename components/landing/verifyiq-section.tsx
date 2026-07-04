import Link from "next/link";
import { VerifyIQDashboardMockup } from "@/components/landing/verifyiq-dashboard-mockup";

/*
  VerifyIQ "coming soon" landing section. Client-provided design (2026-06-28),
  ported to a server component. Styles live in app/globals.css scoped under
  .viq-section. VerifyIQ is built for DSOs and dental groups only (not state
  boards), so the copy stays team-focused. CTA points at the VerifyIQ waitlist
  route. The dashboard mockup is shared with the dedicated /verifyiq page via
  VerifyIQDashboardMockup. No em dashes (brand rule).
*/

export function VerifyIQSection() {
  return (
    <section className="viq-section" id="verifyiq">
      <div className="viq-wrap">
        {/* LEFT: copy */}
        <div className="viq-copy">
          <div className="viq-eyebrow">
            <span className="viq-eyebrow-label">FOR DSOs &amp; DENTAL GROUPS</span>
            <span className="viq-badge">Coming Soon</span>
          </div>

          <h2 className="viq-wordmark">VerifyIQ</h2>

          <p className="viq-tagline">
            See every CE course your whole team takes, and see exactly where the
            gaps are.
          </p>

          <p className="viq-lede">
            <strong>VerifyIQ is built for DSOs and dental groups.</strong> Get
            full visibility into the continuing education your dentists,
            hygienists, and assistants complete across every state you operate
            in: what they’re learning, where they’re short, and how it all
            breaks down by category.
          </p>

          <ul className="viq-features">
            <li>
              <span className="viq-check" aria-hidden="true">
                ✓
              </span>
              <span>
                <strong>See what your team is learning.</strong> Get an overview
                of every CE course your employees take (titles, providers,
                hours, and completion dates), all in one place instead of
                scattered across certificates.
              </span>
            </li>
            <li>
              <span className="viq-check" aria-hidden="true">
                ✓
              </span>
              <span>
                <strong>Understand it by category.</strong> A clear summary of
                the type of content your team is learning (clinical, opioid,
                infection control, ethics, and more), so you can see strengths
                and spot where coverage is thin.
              </span>
            </li>
            <li>
              <span className="viq-check" aria-hidden="true">
                ✓
              </span>
              <span>
                <strong>Know where the holes are.</strong> Automatic flags for
                at-risk and overdue providers against each state’s specific
                requirements, so nothing slips through before renewal.
              </span>
            </li>
            <li>
              <span className="viq-check" aria-hidden="true">
                ✓
              </span>
              <span>
                <strong>Privacy-first by design.</strong> Providers link their
                license with a private org code. You see hours, states, and CE
                categories, never their personal details.
              </span>
            </li>
          </ul>

          <div className="viq-cta-group">
            <Link href="/verifyiq/contact" className="viq-btn">
              Notify me when it launches&nbsp;&nbsp;→
            </Link>
            <span className="viq-cta-note">
              Be the first to onboard your group.
            </span>
          </div>
        </div>

        {/* RIGHT: dashboard mockup (shared with /verifyiq) */}
        <VerifyIQDashboardMockup previewTag />
      </div>
    </section>
  );
}
