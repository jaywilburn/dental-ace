/*
  Onboarding-call scheduler link. AADB asks approved DentalACE customers to book a
  walkthrough. Surfaced in the CE Company approval email (lib/auth/access-requests.ts)
  and as a dismissible banner on the company dashboard (app/company/page.tsx).
  Overridable by env so the link can change without a deploy.
*/
export const ONBOARDING_SCHEDULER_URL =
  process.env.ONBOARDING_SCHEDULER_URL ??
  "https://scheduler.zoom.us/john-stamper-a2wva6/dentalace-onboarding-call";
