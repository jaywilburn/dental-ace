import "server-only";
import { z } from "zod";
import { step2Schema } from "./schemas";
import { richTextPlainLength } from "./rich-text";
import { DETAILED_BIO_PLAIN_MAX, DETAILED_BIO_PLAIN_MIN } from "./bio-limits";

/*
  Server-side WRITE schemas: the rules that need sanitize-html and therefore
  cannot live in ./schemas.ts.

  WHY THE SPLIT: ./schemas.ts ships to the BROWSER. Both public attendee forms
  (components/attend/attendee-form.tsx and event-attendee-form.tsx, each
  "use client") import COURSE_FORMATS from it, so adding a richTextPlainLength
  refine there would pull sanitize-html + htmlparser2 into the bundle for
  /attend, which CLAUDE.md calls the most critical mobile surface.

  WHY WRITE-ONLY: the submit gates (applicationDataSchema,
  sessionApplicationSchema, eventSessionApplicationSchema) keep using the plain
  step2Schema, so a draft saved earlier with a longer bio can still be
  submitted. Only NEW saves are held to the visible-text cap. Read schemas
  already relax detailedBioHtml entirely, so they are unaffected.
*/

// The numbers live in ./bio-limits so the editor can count against the same
// ones client-side without importing this (server-only) module.
export { DETAILED_BIO_PLAIN_MAX, DETAILED_BIO_PLAIN_MIN };

export const step2WriteSchema = step2Schema.extend({
  detailedBioHtml: step2Schema.shape.detailedBioHtml
    .refine(
      // Skip when empty so step2Schema's own "required" message stands alone;
      // otherwise a blank bio stacks two messages saying the same thing.
      (html) => html.length === 0 || richTextPlainLength(html) >= DETAILED_BIO_PLAIN_MIN,
      `Write at least ${DETAILED_BIO_PLAIN_MIN} characters for the detailed bio.`,
    )
    .refine(
      (html) => richTextPlainLength(html) <= DETAILED_BIO_PLAIN_MAX,
      `Keep the detailed bio under ${DETAILED_BIO_PLAIN_MAX.toLocaleString()} characters of text.`,
    ),
});

export type Step2WriteData = z.infer<typeof step2WriteSchema>;
