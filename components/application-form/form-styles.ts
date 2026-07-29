/*
  Shared input styling for the application/event wizards, matching
  logic/dentalace-dev-mockup-suite-v3.html .form-input / .form-select.

  Extracted from form-controls.tsx (server-rendered primitives) so the client
  components in counted-fields.tsx can render an identical-looking control
  without pulling the whole server module into the browser bundle.
*/
export const inputBase =
  "w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] text-navy outline-none transition-colors focus:border-ace focus:ring-2 focus:ring-ace/30";

/** Red ring for a control the server rejected, so the error text is not the
 *  only signal. */
export const inputInvalid = "border-red-400 focus:border-red-500 focus:ring-red-300/40";
