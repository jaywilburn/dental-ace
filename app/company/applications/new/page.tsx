import { PageHeader } from "@/components/portal-shell";
import { ApplicationStepBar } from "@/components/application-form/step-bar";
import {
  FormCard,
  FormErrorBanner,
  FormField,
  FormInput,
  FormLabel,
  FormNav,
  FormTextarea,
} from "@/components/application-form/form-controls";
import { requireApplicationCredits } from "@/lib/company/credit-guards";
import { prisma } from "@/lib/prisma";
import { ensureDraft, getDraftData, saveOrgStep } from "@/lib/forms/application/actions";

/*
  Step 1 — Organization & Contact. Wizard entry: ensureDraft materializes the
  draft once per session. Org name prefills from the company; the process
  administrator prefills from the logged-in user. Saved draft values win over
  prefills so edits stick.
*/
export default async function ApplicationOrgStepPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  const { user, credits: totalCredits } = await requireApplicationCredits();
  const { error, detail } = await searchParams;
  const applicationId = await ensureDraft();
  const draft = await getDraftData(applicationId);

  const company = user.companyId
    ? await prisma.company.findUnique({
        where: { id: user.companyId },
        select: { name: true },
      })
    : null;

  const orgNameDefault = draft.organizationName ?? company?.name ?? "";
  const adminNameDefault =
    draft.adminName ??
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  const adminEmailDefault = draft.adminEmail ?? user.email ?? "";

  return (
    <>
      <PageHeader
        title="Course Application"
        subtitle="Step 1 of 6 — Organization & Contact"
        action={
          <span className="rounded-full bg-ace-bg px-2.5 py-1 text-[10px] font-bold text-ace-dark">
            {totalCredits.applicationCredits} Credits Available
          </span>
        }
      />
      <ApplicationStepBar currentStep={1} />
      <a
        href="/application-overview.pdf"
        target="_blank"
        rel="noopener noreferrer"
        className="mb-5 flex items-center justify-between gap-3 rounded-md border border-ace/40 bg-ace-bg px-4 py-3 text-pretty transition-colors hover:bg-ace-bg/70"
      >
        <span className="text-[12px] text-ace-dark">
          New to the application? Download the Application Worksheet (PDF) to
          gather everything you need before you start.
        </span>
        <span className="shrink-0 text-[12px] font-semibold text-ace-dark">
          ↓ Worksheet
        </span>
      </a>
      {error === "validation" ? <FormErrorBanner detail={detail} /> : null}
      <form action={saveOrgStep} className="space-y-5">
        <input type="hidden" name="applicationId" value={applicationId} />
        <FormCard title="Step 1 — Organization & Contact">
          <FormField fullWidth>
            <FormLabel required>
              Name of Organization / Company / Association / Individual
            </FormLabel>
            <FormInput
              name="organizationName"
              defaultValue={orgNameDefault}
              required
              minLength={2}
              maxLength={200}
            />
          </FormField>
          <FormField fullWidth>
            <FormLabel required hint="City, State, Zip">
              Organization Full Address
            </FormLabel>
            <FormTextarea
              name="organizationAddress"
              defaultValue={draft.organizationAddress ?? ""}
              required
              minLength={5}
              maxLength={400}
            />
          </FormField>
          <FormField fullWidth>
            <FormLabel
              required
              hint="Responsible for all interactions, communications, and billing"
            >
              Process Administrator Full Name
            </FormLabel>
            <FormInput
              name="adminName"
              defaultValue={adminNameDefault}
              required
              minLength={2}
              maxLength={200}
            />
          </FormField>
          <FormField>
            <FormLabel required>Process Administrator Email</FormLabel>
            <FormInput
              type="email"
              name="adminEmail"
              defaultValue={adminEmailDefault}
              required
            />
          </FormField>
          <FormField>
            <FormLabel required>Process Administrator Phone</FormLabel>
            <FormInput
              type="tel"
              name="adminPhone"
              defaultValue={draft.adminPhone ?? ""}
              required
              minLength={7}
              maxLength={40}
            />
          </FormField>
        </FormCard>
        <FormNav nextLabel="Next: Course Information" />
      </form>
    </>
  );
}
