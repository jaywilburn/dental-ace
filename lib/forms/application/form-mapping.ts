import { normalizeFormText } from "@/lib/forms/normalize";
import { MAX_PRESENTERS, PRESENTER_ROLES } from "@/lib/forms/application/schemas";

/*
  Pure FormData -> raw-slice mappers for the shared course-application step
  forms (Organization, Course Information, Creator, Presenters). Field names
  come from the shared step components (components/application-form/steps/).

  THESE ARE THE ONLY PLACE raw wizard strings are built. The standalone wizard
  (lib/forms/application/actions.ts), the FULL_EVENT_QUIZ sub-wizard
  (lib/events/session-actions.ts), the SELECTIVE_INLINE mini-wizard
  (lib/events/inline-session-actions.ts) and the event details step
  (lib/events/event-actions.ts) all call these rather than re-reading FormData,
  which used to exist as three byte-identical copy-paste duplicates. Keeping one
  copy is what makes normalizeFormText impossible to miss: see its doc comment
  for why un-normalized textarea input fails a server cap the browser accepted.

  Outputs are validated with the step schemas at the call site.
*/

/** Organization / contact fields (orgStepSchema slice). */
export function orgRawFromForm(formData: FormData) {
  return {
    organizationName: normalizeFormText(formData.get("organizationName")),
    organizationAddress: normalizeFormText(formData.get("organizationAddress")),
    adminName: normalizeFormText(formData.get("adminName")),
    adminEmail: normalizeFormText(formData.get("adminEmail")),
    adminPhone: normalizeFormText(formData.get("adminPhone")),
  };
}

/**
 * Course Information fields (step1Schema slice). `prefix` scopes the field
 * names for forms carrying several course-info groups at once (the inline
 * sessions form posts one group per session as `s{i}_courseTitle`, ...).
 */
export function courseInfoRawFromForm(formData: FormData, prefix = "") {
  return {
    courseTitle: normalizeFormText(formData.get(`${prefix}courseTitle`)),
    ceCreditHours: Number(formData.get(`${prefix}ceCreditHours`) ?? 0),
    subjectMatter: normalizeFormText(formData.get(`${prefix}subjectMatter`)),
    deliveryFormat: normalizeFormText(formData.get(`${prefix}deliveryFormat`)),
    primaryDistributionFormat: normalizeFormText(
      formData.get(`${prefix}primaryDistributionFormat`),
    ),
    shortDescription: normalizeFormText(formData.get(`${prefix}shortDescription`)),
    publicProtectionStatement: normalizeFormText(
      formData.get(`${prefix}publicProtectionStatement`),
    ),
    courseObjectives: normalizeFormText(formData.get(`${prefix}courseObjectives`)),
    courseOutline: normalizeFormText(formData.get(`${prefix}courseOutline`)),
  };
}

/**
 * Creator fields (step2Schema slice). `detailedBioHtml` must already be
 * sanitizeRichText() output; callers sanitize before mapping so the draft echo
 * can never persist raw pasted markup.
 */
export function creatorRawFromForm(formData: FormData, detailedBioHtml: string) {
  return {
    creatorName: normalizeFormText(formData.get("creatorName")),
    credentials: normalizeFormText(formData.get("credentials")),
    currentPosition: normalizeFormText(formData.get("currentPosition")),
    detailedBioHtml,
    creatorEmail: normalizeFormText(formData.get("creatorEmail")),
    creatorPhone: normalizeFormText(formData.get("creatorPhone")),
    creatorAddress: normalizeFormText(formData.get("creatorAddress")),
    highestDegree: normalizeFormText(formData.get("highestDegree")),
    educationPart1: normalizeFormText(formData.get("educationPart1")),
    // Normalize BEFORE the fallback so a whitespace-only entry clears the field
    // rather than persisting spaces.
    educationPart2: normalizeFormText(formData.get("educationPart2")) || undefined,
    educationPart3: normalizeFormText(formData.get("educationPart3")) || undefined,
    educationPart4: normalizeFormText(formData.get("educationPart4")) || "N/A",
    creatorExperience: normalizeFormText(formData.get("creatorExperience")),
  };
}

const PRESENTER_FIELD = /^presenter_(\d+)_/;

const [PRIMARY_ROLE, DEFAULT_ADDED_ROLE] = PRESENTER_ROLES;

/**
 * Presenters fields (step3Schema slice). Cards post `presenter_<i>_<field>`
 * numbered by their current position, so a normal post is contiguous. Indices
 * are still read from the posted keys and compacted in order, so a stale or
 * hand-built post with a gap keeps every presenter rather than silently
 * dropping the ones after it. Presenter 1 is always the Primary
 * Presenter and no later presenter can claim that role (old drafts saved with
 * a Co-Presenter first are corrected here on their next save). One index past
 * the cap is kept so the schema's .max reports a tampered post instead of the
 * extras vanishing silently.
 */
export function presentersRawFromForm(formData: FormData) {
  const indices = new Set<number>([0]);
  for (const key of formData.keys()) {
    const m = PRESENTER_FIELD.exec(key);
    if (m) indices.add(Number(m[1]));
  }
  const ordered = [...indices].sort((a, b) => a - b).slice(0, MAX_PRESENTERS + 1);

  return {
    presenters: ordered.map((idx, position) => {
      const field = (name: string) => normalizeFormText(formData.get(`presenter_${idx}_${name}`));
      const role = field("role");
      return {
        name: field("name"),
        role:
          position === 0
            ? PRIMARY_ROLE
            : role && role !== PRIMARY_ROLE
              ? role
              : DEFAULT_ADDED_ROLE,
        commercialDisclosure: field("commercialDisclosure"),
        experience: field("experience"),
        training: field("training"),
        bio: field("bio"),
      };
    }),
  };
}
