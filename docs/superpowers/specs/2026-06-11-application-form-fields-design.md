# DentalACE Application Form — Field Expansion

**Date:** 2026-06-11
**Status:** Approved design (pending written-spec review)
**Area:** `lib/forms/application/*`, `app/company/applications/new/*`, reviewer detail view

## Context

The DentalACE course application is a multi-step wizard. Each step's slice is
validated with Zod and merged into `course_applications.application_data`
(a JSON column), so **new fields require no DB migration**. The client supplied
an updated 28-field application spec. Some fields already exist; this design
covers only the gaps and the one enum change.

Current wizard: **Course Info → Creator → Presenters → Quiz → Review**
(`STEP_ROUTES` in `lib/forms/application/actions.ts`; `step1Schema`..`step4Schema`
in `lib/forms/application/schemas.ts`).

## Decisions (confirmed with client 2026-06-11)

1. **Course Format** adopts the 5 granular options from the doc (replacing the
   current 4). Legacy values stay readable.
2. **Organization & Contact** fields are captured per application, **prefilled
   but editable** (org name from the company; admin from the logged-in user).
3. **Creator** keeps its existing fields (credentials, current position, bio,
   CV); the new creator fields are added **alongside**.
4. **Presenters** keep name/role/commercial-disclosure; experience, training,
   and bio are added **per presenter**.
5. Organization & Contact becomes a **new first step** (wizard → 6 steps).
6. Creator **Education Part 1 is required**; Parts 2–4 optional (Part 4
   defaults to "N/A").
7. **#29 (per-presenter headshot) is dropped** — the client no longer wants it.
   (The existing top-level `headshot` field is left untouched; out of scope.)

## Field mapping (all 28, #29 excluded)

| # | Doc field | Status | Implementation |
|---|-----------|--------|----------------|
| 1 | Public-protection statement | exists | `publicProtectionStatement` |
| 2 | Organization name | **new** | `organizationName` (prefill `company.name`) |
| 3 | Organization full address | **new** | `organizationAddress` (textarea) |
| 4 | Process Admin full name | **new** | `adminName` (prefill user) |
| 5 | Process Admin email | **new** | `adminEmail` (email, prefill user) |
| 6 | Process Admin phone | **new** | `adminPhone` |
| 7 | Course Title | exists | `courseTitle` |
| 8 | CE Credit Hours | exists | `ceCreditHours` |
| 9 | Course Subject Matter | exists (relabel) | `subjectMatter`; UI label "Scientific (Clinical)" |
| 10 | Course Objectives (min 3) | exists | `courseObjectives` |
| 11 | Course Short Description | **new** | `shortDescription` (textarea, ~2 paragraphs) |
| 12 | Course Outline upload | exists | `courseOutline` |
| 13 | Course Format | **change** | `deliveryFormat` → 5 options (see below) |
| 14 | Most-used distribution format | **new** | `primaryDistributionFormat` (same 5 options) |
| 15 | Course Creator name | exists | `creatorName` |
| 16 | Creator email | **new** | `creatorEmail` (email) |
| 17 | Creator phone | **new** | `creatorPhone` |
| 18 | Creator address | **new** | `creatorAddress` |
| 19 | Creator highest degree | **new** | `highestDegree` (enum) |
| 20 | Education Part 1 | **new** | `educationPart1` (required) |
| 21 | Education Part 2 | **new** | `educationPart2` (optional) |
| 22 | Education Part 3 | **new** | `educationPart3` (optional) |
| 23 | Education Part 4 | **new** | `educationPart4` (optional, default "N/A") |
| 24 | Creator experience re: subject | **new** | `creatorExperience` (textarea) |
| 25 | CV/Resume/Bio upload | exists | `cvResume` |
| 26 | Presenter experience | **new** | `presenter.experience` (per presenter) |
| 27 | Training received by presenter | **new** | `presenter.training` (per presenter) |
| 28 | Bio for each presenter | **new** | `presenter.bio` (per presenter) |
| 29 | Per-presenter headshot | **dropped** | n/a |

## Wizard structure (6 steps)

| Step | Page route | Schema | Notes |
|------|-----------|--------|-------|
| 1 | `/company/applications/new` | `orgStepSchema` (new) | **new entry**; Organization & Contact |
| 2 | `/company/applications/new/course` (renamed from current entry) | `step1Schema` (+ additions) | Course Info |
| 3 | `/company/applications/new/creator` | `step2Schema` (+ additions) | Creator |
| 4 | `/company/applications/new/presenters` | `step3Schema` (+ additions) | Presenters |
| 5 | `/company/applications/new/quiz` | `step4Schema` | Quiz (unchanged) |
| 6 | `/company/applications/new/review` | full parse | Review/submit |

The new Organization step becomes the wizard entry (`/new`); the current Course
Info page moves to `/new/course`. `STEP_ROUTES`, the per-page `currentStep`
prop, the `ApplicationStepBar` labels/union (`1..5` → `1..6`), and the save-step
redirect indices shift by one accordingly. Exact route/file mechanics are
resolved in the implementation plan.

## New schema slices

```
orgStepSchema = {
  organizationName: string min 2 max 200
  organizationAddress: string min 5 max 400
  adminName: string min 2 max 200
  adminEmail: string email
  adminPhone: string min 7 max 40
}
```

**step1Schema additions:**
```
shortDescription: string min 20 max 1500
primaryDistributionFormat: enum(DELIVERY_FORMATS)
```

**step2Schema additions:**
```
creatorEmail: string email
creatorPhone: string min 7 max 40
creatorAddress: string min 5 max 400
highestDegree: enum("Associates","Bachelors","Masters","Doctoral","None of the Above")
educationPart1: string min 2 max 1000
educationPart2: string max 1000 optional
educationPart3: string max 1000 optional
educationPart4: string max 1000 default "N/A"
creatorExperience: string min 10 max 2000
```

**presenterSchema additions (per presenter):**
```
experience: string min 2 max 1000
training: string min 2 max 1000
bio: string min 2 max 2000
```

## Course Format change (#13/#14)

```
DELIVERY_FORMATS = [
  "Live/In Person",
  "Live/Online",
  "On Demand Video",
  "On Demand Audio",
  "Printed Course",
]
LIVE_FORMATS = ["Live/In Person", "Live/Online"]
```

`isLiveFormat()` keeps accepting the legacy `"Live Event"` and `"Live/Virtual"`
values so existing applications, combined-cert questions, and Event Setup
eligibility continue to work. The verbose doc descriptions ("Presenter(s) must
be available LIVE for Q&A…", "Requires a 5-question quiz…") render as **helper
text** under each radio option; they are not stored values.

## Backward compatibility

New fields are **required on the write/submit path** (their step schemas, and
`applicationDataSchema` used by `submitApplication`). They are added as
**`.optional()` in `applicationDataReadSchema`** (the tolerant read path used by
the reviewer detail view and Event Setup eligibility) so that applications
created before this change remain viewable and approvable. This follows the
pattern already established for `professionalBio` / `detailedBio` / retired
enum values in `schemas.ts`.

## Display surfaces

- **Reviewer detail page** (`app/reviewer/[applicationId]`): render the new
  Organization & Contact, creator, and presenter fields so reviewers see them.
- **Review step** (`/new/review`): include the new fields in the pre-submit
  summary.
- Certificates and transactional emails are **unaffected** (they use
  title/hours/etc., none of the new fields).

## Out of scope

- No DB migration (all fields live in the `application_data` JSON).
- No changes to certificate rendering, billing, or quiz logic.
- Per-presenter headshot (#29).

## Files touched

- `lib/forms/application/schemas.ts` — new `orgStepSchema`, step additions,
  format enum, read-schema optionals.
- `lib/forms/application/actions.ts` — new `saveOrgStep`, `STEP_ROUTES` +
  redirect index shift, prefill of org/admin defaults, submit full-parse.
- `app/company/applications/new/page.tsx` — becomes Organization step.
- `app/company/applications/new/course/page.tsx` — relocated Course Info (+ new fields).
- `app/company/applications/new/creator/page.tsx` — creator additions.
- `app/company/applications/new/presenters/page.tsx` — presenter additions.
- `app/company/applications/new/review/page.tsx` — summary of new fields.
- `components/application-form/step-bar.tsx` — 6 labels, `1..6` union.
- `components/application-form/form-controls.tsx` — any new control types.
- `app/reviewer/[applicationId]/...` — reviewer display of new fields.
