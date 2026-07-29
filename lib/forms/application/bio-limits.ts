/*
  Detailed-bio length limits, in their own module because they are needed on
  BOTH sides of the server/client line: the write schema enforces them
  (lib/forms/application/write-schemas.ts, server-only because measuring visible
  text needs sanitize-html) and the editor counts against them in the browser
  (components/application-form/rich-text-editor.tsx).

  Plain constants only. Nothing here may import sanitize-html, or the public
  attendee bundle grows for no reason.
*/

/** Visible-text ceiling for the creator bio.
 *
 *  detailedBioHtml's raw .max(20_000) counts HTML, so a Word or Google Docs
 *  paste can spend the whole budget on markup with very little visible text and
 *  produce a rejection the provider cannot explain. Measuring what a reader
 *  actually sees makes the limit mean something. */
export const DETAILED_BIO_PLAIN_MAX = 5_000;

/** Visible-text floor. Previously an ad-hoc pre-check in each of the three
 *  creator-step savers that redirected BEFORE the merge helper ran, bypassing
 *  the draft echo and blanking all 13 creator fields. */
export const DETAILED_BIO_PLAIN_MIN = 20;

/** Raw HTML ceiling, mirroring step2Schema's own .max(). The editor warns as
 *  this fills up so heavy formatting does not fail the step by surprise. */
export const DETAILED_BIO_HTML_MAX = 20_000;
