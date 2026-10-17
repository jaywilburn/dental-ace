import type { SurveyFieldErrors, SurveyQuestion } from "@/lib/events/survey-schemas";

/*
  useActionState shape shared by the survey save actions
  (lib/events/survey-actions.ts) and the editor
  (components/events/survey-editor.tsx). Its own pure module so the client
  editor never imports anything from a "use server" or server-only file.

  null is the initial state (nothing posted yet). On success the saved
  questions come back with their server-assigned ids, so the editor can adopt
  them. Without that, a second save from the same page would post the new
  questions without ids, they would get fresh ids again, and their answers
  would split across two export columns.
*/
export type SurveySaveState =
  | { ok: true; savedAt: number; questions: SurveyQuestion[] }
  /** Errors keyed "<index>.<field>" or SURVEY_FORM_KEY (see survey-schemas). */
  | { ok: false; errors: SurveyFieldErrors }
  | null;

export type SurveySaveAction = (
  prev: SurveySaveState,
  formData: FormData,
) => Promise<SurveySaveState>;
