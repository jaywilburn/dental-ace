import Link from "next/link";

/*
  VerifyIQ "coming soon" landing section. Client-provided design (2026-06-28),
  ported to a server component. Styles live in app/globals.css scoped under
  .viq-section. The DSO product accent is gold to distinguish it from the blue
  Verify (state boards) section above it. CTA points at the existing Verify
  sales-lead route. No em dashes (brand rule).
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
            Verify is built for state boards.{" "}
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
            <Link href="/verify/contact" className="viq-btn">
              Notify me when it launches&nbsp;&nbsp;→
            </Link>
            <span className="viq-cta-note">
              Be the first to onboard your group.
            </span>
          </div>
        </div>

        {/* RIGHT: dashboard mockup */}
        <div className="viq-mockup-zone">
          <div className="viq-soon-tag">Preview</div>

          <div className="viq-browser">
            <div className="viq-chrome">
              <span className="viq-dot viq-dot-r" />
              <span className="viq-dot viq-dot-y" />
              <span className="viq-dot viq-dot-g" />
              <div className="viq-url">dentalace.org/verifyiq/dashboard</div>
            </div>

            <div className="viq-dash">
              <div className="viq-dash-head">
                <div className="viq-dash-org">Bright Smiles Dental Group</div>
                <div className="viq-dash-sub">
                  142 providers · 9 states · current renewal cycle
                </div>
              </div>

              <div className="viq-stats">
                <div className="viq-stat viq-s-green">
                  <div className="viq-stat-val">118</div>
                  <div className="viq-stat-lbl">On track</div>
                </div>
                <div className="viq-stat viq-s-orange">
                  <div className="viq-stat-val">19</div>
                  <div className="viq-stat-lbl">At risk</div>
                </div>
                <div className="viq-stat viq-s-red">
                  <div className="viq-stat-val">5</div>
                  <div className="viq-stat-lbl">Overdue</div>
                </div>
                <div className="viq-stat viq-s-blue">
                  <div className="viq-stat-val">9</div>
                  <div className="viq-stat-lbl">States</div>
                </div>
              </div>

              <div className="viq-panel">
                <div className="viq-panel-hd">CE hours completed by category</div>
                <div className="viq-cat">
                  <div className="viq-cat-row">
                    <span className="viq-cat-name">Clinical / restorative</span>
                    <div className="viq-cat-track">
                      <div
                        className="viq-cat-fill viq-bar-blue"
                        style={{ width: "88%" }}
                      />
                    </div>
                    <span className="viq-cat-val">1,284 hrs</span>
                  </div>
                  <div className="viq-cat-row">
                    <span className="viq-cat-name">Infection control</span>
                    <div className="viq-cat-track">
                      <div
                        className="viq-cat-fill viq-bar-green"
                        style={{ width: "64%" }}
                      />
                    </div>
                    <span className="viq-cat-val">512 hrs</span>
                  </div>
                  <div className="viq-cat-row">
                    <span className="viq-cat-name">Opioid / pain mgmt</span>
                    <div className="viq-cat-track">
                      <div
                        className="viq-cat-fill viq-bar-orange"
                        style={{ width: "34%" }}
                      />
                    </div>
                    <span className="viq-cat-val">196 hrs</span>
                  </div>
                  <div className="viq-cat-row">
                    <span className="viq-cat-name">Ethics / jurisprudence</span>
                    <div className="viq-cat-track">
                      <div
                        className="viq-cat-fill viq-bar-gold"
                        style={{ width: "22%" }}
                      />
                    </div>
                    <span className="viq-cat-val">118 hrs</span>
                  </div>
                </div>
              </div>

              <div className="viq-rows">
                <div className="viq-rows-hd">Recent CE activity</div>
                <div className="viq-row">
                  <div className="viq-row-name">
                    <span className="viq-pname">Dr. Sarah Okafor</span>
                    <span className="viq-course">
                      “Advanced Implant Restoration” · 4 hrs · Clinical
                    </span>
                  </div>
                  <span className="viq-pill viq-p-ok">Complete</span>
                </div>
                <div className="viq-row">
                  <div className="viq-row-name">
                    <span className="viq-pname">Marcus Chen, RDH</span>
                    <span className="viq-course">
                      Missing: Opioid training (TX) · 2 hrs required
                    </span>
                  </div>
                  <span className="viq-pill viq-p-warn">At risk</span>
                </div>
                <div className="viq-row">
                  <div className="viq-row-name">
                    <span className="viq-pname">Priya Nair, CDA</span>
                    <span className="viq-course">
                      Missing: Medical errors + ethics (FL)
                    </span>
                  </div>
                  <span className="viq-pill viq-p-over">Overdue</span>
                </div>
                <div className="viq-row">
                  <div className="viq-row-name">
                    <span className="viq-pname">Dr. James Kowalski</span>
                    <span className="viq-course">
                      “Infection Control Update 2025” · 3 hrs
                    </span>
                  </div>
                  <span className="viq-pill viq-p-track">On track</span>
                </div>
              </div>

              <div className="viq-rows-more">
                + 138 more providers · full course history &amp; category
                breakdown
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
