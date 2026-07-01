/*
  VerifyIQ dashboard mockup, extracted from the home teaser (verifyiq-section.tsx)
  so both the teaser and the dedicated /verifyiq page render one source of truth.
  Styling is the .viq-* rules in app/globals.css; the --viq-* custom properties
  those rules read live on :root, so this renders correctly anywhere (not just
  inside .viq-section). The dashboard interior is product-neutral navy; the gold
  "Preview" tag is opt-in via previewTag so blue-accented surfaces can omit it.
*/
export function VerifyIQDashboardMockup({
  previewTag = false,
}: {
  previewTag?: boolean;
}) {
  return (
    <div className="viq-mockup-zone">
      {previewTag ? <div className="viq-soon-tag">Preview</div> : null}

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
                  &ldquo;Advanced Implant Restoration&rdquo; · 4 hrs · Clinical
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
                  &ldquo;Infection Control Update 2025&rdquo; · 3 hrs
                </span>
              </div>
              <span className="viq-pill viq-p-track">On track</span>
            </div>
          </div>

          <div className="viq-rows-more">
            + 138 more providers · full course history &amp; category breakdown
          </div>
        </div>
      </div>
    </div>
  );
}
