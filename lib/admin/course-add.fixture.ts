/*
  Test fixture: the "Add approved course" form as posted for DA236 (Emme Sanders
  RDH), the course that prompted the feature. Quiz text is the provider's,
  verbatim. Shared by course-add-rules.test.ts and course-add.test.ts.
*/
export const DA236_FIELDS: Record<string, string> = {
  courseIdNumber: "ACE-LEG-00124",
  courseTitle: "COLLABricon Ultimate Team Synergy Summit",
  legacyCourseId: "DA236",
  ceHours: "6",
  courseType: "Business/Practice Management",
  deliveryMethod: "LIVE In Person",
  approvedOn: "2025-10-14",
  q1_question: "Collaboration within dental teams increases treatment acceptance and patient satisfaction.",
  q1_correct: "True",
  q2_question: "Debriefing is only valuable for leadership teams, not clinical teams.",
  q2_correct: "False",
  q3_question: "Which of the following is NOT a key component of team synergy?",
  q3_option_0: "Communication",
  q3_option_1: "Competition",
  q3_option_2: "Clarity",
  q3_option_3: "Collaboration",
  q3_correct: "1",
  q4_question: "What is one major outcome of implementing team debriefing in practice?",
  q4_option_0: "Increased confusion",
  q4_option_1: "Higher stress",
  q4_option_2: "Improved communication",
  q4_option_3: "Reduced productivity",
  q4_correct: "2",
  q5_question: "Which phrase best captures the goal of COLLABricon?",
  q5_option_0: "Learn alone, lead alone",
  q5_option_1: "Vision, Action, Transformation",
  q5_option_2: "Profit over people",
  q5_option_3: "Individual success stories",
  q5_correct: "1",
};

export function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}
