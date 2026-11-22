import { signLeadFormToken } from "@/lib/leads/form-token";

/*
  Invisible anti-spam fields for the marketing lead forms (Verify and VerifyIQ
  contact), checked by submitMarketingLead via lib/leads/spam.ts:
  - form_token: a signed render time, so a submission sent too fast, or posted
    without loading the page, is caught. The pages read searchParams, so they
    render per request and the timestamp is fresh.
  - two honeypots, "website" (a name form-fillers can't resist) and the
    original "company_url": off-screen, unfocusable, never autofilled. A person
    never sees them; anything typed into them marks the lead as spam.
  Render inside the <form>, which must be `relative`.
*/
export function LeadFormGuards() {
  return (
    <>
      <input type="hidden" name="form_token" value={signLeadFormToken()} />
      <div
        aria-hidden="true"
        className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden"
      >
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        <label htmlFor="company_url">Leave this field empty</label>
        <input id="company_url" name="company_url" type="text" tabIndex={-1} autoComplete="off" />
      </div>
    </>
  );
}
