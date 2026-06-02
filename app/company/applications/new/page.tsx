import { PageHeader } from "@/components/portal-shell";
import { ApplicationStepBar } from "@/components/application-form/step-bar";
import {
  FormCard,
  FormField,
  FormInput,
  FormLabel,
  FormNav,
  FormSelect,
  FormTextarea,
} from "@/components/application-form/form-controls";
import { requireDentalAce } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  DELIVERY_FORMATS,
  SUBJECT_MATTERS,
  TARGET_AUDIENCES,
  ADA_CERP_CATEGORIES,
} from "@/lib/forms/application/schemas";
import { ensureDraft, getDraftData, saveStep1 } from "@/lib/forms/application/actions";

/*
  Step 1 — Course Information (fields 1-14 incl. Live Event detection).
  Server component. The draft id is materialized once per session via ensureDraft.
*/
export default async function ApplicationStep1Page() {
  const user = await requireDentalAce();
  const applicationId = await ensureDraft();
  const draft = await getDraftData(applicationId);

  const totalCredits = user.companyId
    ? (
        await prisma.company.findUnique({
          where: { id: user.companyId },
          select: { applicationCredits: true, expeditedCredits: true },
        })
      ) ?? { applicationCredits: 0, expeditedCredits: 0 }
    : { applicationCredits: 0, expeditedCredits: 0 };

  const isLiveEvent = draft.deliveryFormat === "Live Event";

  return (
    <>
      <PageHeader
        title="Course Application"
        subtitle="34 fields · 5 steps · 1 application credit consumed on submit"
        action={
          <span className="rounded-full bg-ace-bg px-2.5 py-1 text-[10px] font-bold text-ace-dark">
            {totalCredits.applicationCredits + totalCredits.expeditedCredits} Credits Available
          </span>
        }
      />
      <ApplicationStepBar currentStep={1} />
      <form action={saveStep1} className="space-y-5">
        <input type="hidden" name="applicationId" value={applicationId} />
        <FormCard title="Step 1 — Course Information">
          <FormField fullWidth>
            <FormLabel required>Course Title</FormLabel>
            <FormInput
              name="courseTitle"
              defaultValue={draft.courseTitle ?? ""}
              required
            />
          </FormField>
          <FormField>
            <FormLabel required>CE Credit Hours</FormLabel>
            <FormInput
              type="number"
              step="0.5"
              min="0.5"
              max="40"
              name="ceCreditHours"
              defaultValue={draft.ceCreditHours ?? ""}
              required
            />
          </FormField>
          <FormField>
            <FormLabel required>Course Duration (hours)</FormLabel>
            <FormInput
              type="number"
              step="0.5"
              min="0.5"
              max="40"
              name="courseDurationHours"
              defaultValue={draft.courseDurationHours ?? ""}
              required
            />
          </FormField>
          <FormField>
            <FormLabel required>Subject Matter Category</FormLabel>
            <FormSelect
              name="subjectMatter"
              defaultValue={draft.subjectMatter ?? SUBJECT_MATTERS[0]}
              options={SUBJECT_MATTERS}
            />
          </FormField>
          <FormField>
            <FormLabel required>Delivery Format</FormLabel>
            <FormSelect
              name="deliveryFormat"
              defaultValue={draft.deliveryFormat ?? DELIVERY_FORMATS[0]}
              options={DELIVERY_FORMATS}
            />
          </FormField>
          {isLiveEvent ? (
            <FormField fullWidth>
              <div className="rounded-md border-2 border-ace bg-ace-bg p-4">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-ace-dark">
                  ★ Live Event detected — two questions before you continue
                </p>
                <div className="mb-4">
                  <FormLabel required>
                    Will live attendees receive one combined certificate for the
                    full event?
                  </FormLabel>
                  <div className="flex flex-col gap-2 text-[12px] text-text-mid sm:flex-row sm:gap-6">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="combinedCert"
                        value="yes"
                        defaultChecked={draft.combinedCert !== false}
                      />
                      Yes — one combined certificate
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="combinedCert"
                        value="no"
                        defaultChecked={draft.combinedCert === false}
                      />
                      No — one certificate per session
                    </label>
                  </div>
                </div>
                <div>
                  <FormLabel required>
                    Will individual sessions also be offered on-demand for CE
                    credit?
                  </FormLabel>
                  <div className="flex flex-col gap-2 text-[12px] text-text-mid">
                    <label className="flex items-start gap-2">
                      <input
                        type="radio"
                        name="submitSessionsSeparately"
                        value="yes"
                        defaultChecked={draft.submitSessionsSeparately === true}
                      />
                      <span>
                        <strong>Yes</strong>, I am submitting each session as its
                        own course application now. I&apos;ll tag them to this
                        event in Event Setup after they&apos;re approved.
                      </span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="submitSessionsSeparately"
                        value="no"
                        defaultChecked={draft.submitSessionsSeparately !== true}
                      />
                      No — live event only, no on-demand CE
                    </label>
                  </div>
                </div>
              </div>
            </FormField>
          ) : null}
          <FormField fullWidth>
            <FormLabel required hint="How does this course benefit patient safety?">
              Public Protection Statement
            </FormLabel>
            <FormTextarea
              name="publicProtectionStatement"
              defaultValue={draft.publicProtectionStatement ?? ""}
              required
            />
          </FormField>
          <FormField fullWidth>
            <FormLabel required hint="Minimum 3, list each on a new line">
              Course Objectives
            </FormLabel>
            <FormTextarea
              name="courseObjectives"
              defaultValue={draft.courseObjectives ?? ""}
              required
              className="min-h-[110px]"
            />
          </FormField>
          <FormField>
            <FormLabel required>Target Audience</FormLabel>
            <FormSelect
              name="targetAudience"
              defaultValue={draft.targetAudience ?? TARGET_AUDIENCES[0]}
              options={TARGET_AUDIENCES}
            />
          </FormField>
          <FormField>
            <FormLabel>ADA CERP Category</FormLabel>
            <FormSelect
              name="adaCerpCategory"
              defaultValue={draft.adaCerpCategory ?? ADA_CERP_CATEGORIES[0]}
              options={ADA_CERP_CATEGORIES}
            />
          </FormField>
        </FormCard>
        <FormNav nextLabel="Next: Course Creator" />
      </form>
    </>
  );
}
