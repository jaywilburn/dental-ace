/*
  Pure FormData -> raw-slice mappers for the shared course-application step
  forms (Course Information, Creator, Presenters). Field names come from the
  shared step components (components/application-form/steps/); the mapping here
  mirrors saveStep1-3 (lib/forms/application/actions.ts) and the event-session
  sub-wizard savers (lib/events/session-actions.ts) exactly, so the
  SELECTIVE_INLINE event-level application steps persist the same shape.
  Outputs are validated with the step schemas at the call site.
*/

/**
 * Course Information fields (step1Schema slice). `prefix` scopes the field
 * names for forms carrying several course-info groups at once (the inline
 * sessions form posts one group per session as `s{i}_courseTitle`, ...).
 */
export function courseInfoRawFromForm(formData: FormData, prefix = "") {
  return {
    courseTitle: String(formData.get(`${prefix}courseTitle`) ?? ""),
    ceCreditHours: Number(formData.get(`${prefix}ceCreditHours`) ?? 0),
    subjectMatter: String(formData.get(`${prefix}subjectMatter`) ?? ""),
    deliveryFormat: String(formData.get(`${prefix}deliveryFormat`) ?? ""),
    primaryDistributionFormat: String(formData.get(`${prefix}primaryDistributionFormat`) ?? ""),
    shortDescription: String(formData.get(`${prefix}shortDescription`) ?? ""),
    publicProtectionStatement: String(formData.get(`${prefix}publicProtectionStatement`) ?? ""),
    courseObjectives: String(formData.get(`${prefix}courseObjectives`) ?? ""),
    courseOutline: String(formData.get(`${prefix}courseOutline`) ?? ""),
  };
}

/**
 * Creator fields (step2Schema slice). `detailedBioHtml` must already be
 * sanitizeRichText() output — callers sanitize + length-check before mapping.
 */
export function creatorRawFromForm(formData: FormData, detailedBioHtml: string) {
  return {
    creatorName: String(formData.get("creatorName") ?? ""),
    credentials: String(formData.get("credentials") ?? ""),
    currentPosition: String(formData.get("currentPosition") ?? ""),
    detailedBioHtml,
    creatorEmail: String(formData.get("creatorEmail") ?? ""),
    creatorPhone: String(formData.get("creatorPhone") ?? ""),
    creatorAddress: String(formData.get("creatorAddress") ?? ""),
    highestDegree: String(formData.get("highestDegree") ?? ""),
    educationPart1: String(formData.get("educationPart1") ?? ""),
    educationPart2: String(formData.get("educationPart2") ?? "") || undefined,
    educationPart3: String(formData.get("educationPart3") ?? "") || undefined,
    educationPart4: String(formData.get("educationPart4") ?? "") || "N/A",
    creatorExperience: String(formData.get("creatorExperience") ?? ""),
  };
}

/** Presenters fields (step3Schema slice; Phase 1 ships one primary presenter). */
export function presentersRawFromForm(formData: FormData) {
  return {
    presenters: [
      {
        name: String(formData.get("presenter_0_name") ?? ""),
        role: String(formData.get("presenter_0_role") ?? "Primary Presenter"),
        commercialDisclosure: String(formData.get("presenter_0_commercialDisclosure") ?? ""),
        experience: String(formData.get("presenter_0_experience") ?? ""),
        training: String(formData.get("presenter_0_training") ?? ""),
        bio: String(formData.get("presenter_0_bio") ?? ""),
      },
    ],
  };
}
