"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  orgStepSchema,
  step1Schema,
  step3Schema,
  step4Schema,
  applicationDataSchema,
  type ApplicationData,
  type FileRef,
} from "@/lib/forms/application/schemas";
import { step2WriteSchema } from "@/lib/forms/application/write-schemas";
import {
  orgRawFromForm,
  courseInfoRawFromForm,
  creatorRawFromForm,
  presentersRawFromForm,
} from "@/lib/forms/application/form-mapping";
import {
  uploadMetaSchema,
  validateUpload,
  sanitizeFilename,
  buildAttachmentPath,
  type AttachmentField,
} from "@/lib/forms/application/upload-schema";
import { sanitizeRichText } from "@/lib/forms/application/rich-text";
import { quizFromFormData } from "@/lib/forms/application/quiz-form";
import { mergeApplicationStep } from "@/lib/forms/application/merge-step";
import { sendEmail } from "@/lib/email/send";
import ApplicationSubmittedEmail from "@/emails/application-submitted";
import {
  getReviewerNotificationRecipients,
  reviewerNotificationToAddress,
} from "@/lib/reviewer/notify";

/*
  Server actions for the multi-step course application form.

  Flow per step:
  1. Resolve the customer's draft (or create one).
  2. Validate the step's slice with Zod.
  3. Merge into course_applications.application_data.
  4. Redirect to the next step.

  Submit (Step 5) atomically consumes a credit and transitions DRAFT -> PENDING.
*/

const STEP_ROUTES = [
  "/company/applications/new", // 0 — Organization & Contact (entry)
  "/company/applications/new/course", // 1 — Course Info
  "/company/applications/new/creator", // 2 — Creator
  "/company/applications/new/presenters", // 3 — Presenters
  "/company/applications/new/quiz", // 4 — Quiz
  "/company/applications/new/review", // 5 — Review
] as const;

async function getCustomerCompanyId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user || !user.companyId) {
    redirect("/login");
  }
  return user.companyId;
}

/** Find the customer's current DRAFT application or create a new one. */
export async function ensureDraft(): Promise<string> {
  const companyId = await getCustomerCompanyId();

  const existing = await prisma.courseApplication.findFirst({
    // eventId:null so the standalone wizard never resumes an inline event-scoped
    // session draft (those are edited only inside the Event wizard).
    where: { companyId, status: "DRAFT", eventId: null },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.courseApplication.create({
    data: {
      companyId,
      status: "DRAFT",
      applicationData: {},
    },
    select: { id: true },
  });
  return created.id;
}

/** Read the current draft's persisted application_data. */
export async function getDraftData(applicationId: string): Promise<Partial<ApplicationData>> {
  const companyId = await getCustomerCompanyId();
  const row = await prisma.courseApplication.findFirst({
    where: { id: applicationId, companyId, status: "DRAFT" },
    select: { applicationData: true },
  });
  return (row?.applicationData as Partial<ApplicationData> | null) ?? {};
}

/**
 * Validate a step's slice and merge it into the draft's applicationData.
 * On validation failure, redirects back to `stepRoute` with an error message
 * in the query string (the step pages render it as a banner) instead of
 * throwing an unhandled ZodError at the user.
 */
async function mergeStep<T>(
  applicationId: string,
  schema: z.ZodTypeAny,
  raw: unknown,
  stepRoute: string,
): Promise<T> {
  const companyId = await getCustomerCompanyId();
  return mergeApplicationStep<T>(applicationId, companyId, schema, raw, stepRoute);
}

export async function saveOrgStep(formData: FormData) {
  const applicationId = String(formData.get("applicationId") ?? "");
  if (!applicationId) throw new Error("Missing applicationId");

  await mergeStep(applicationId, orgStepSchema, orgRawFromForm(formData), STEP_ROUTES[0]);
  redirect(STEP_ROUTES[1]);
}

export async function saveStep1(formData: FormData) {
  const applicationId = String(formData.get("applicationId") ?? "");
  if (!applicationId) throw new Error("Missing applicationId");

  await mergeStep(applicationId, step1Schema, courseInfoRawFromForm(formData), STEP_ROUTES[1]);
  redirect(STEP_ROUTES[2]);
}

export async function saveStep2(formData: FormData) {
  const applicationId = String(formData.get("applicationId") ?? "");
  if (!applicationId) throw new Error("Missing applicationId");

  // Sanitize before validation or storage, so the draft echo can never persist
  // raw pasted markup. The visible-text floor and ceiling live in
  // step2WriteSchema; they used to be an ad-hoc pre-check here that redirected
  // BEFORE the merge helper ran, which bypassed the echo and blanked all 13
  // creator fields.
  const detailedBioHtml = sanitizeRichText(
    String(formData.get("detailedBioHtml") ?? ""),
  );
  await mergeStep(
    applicationId,
    step2WriteSchema,
    creatorRawFromForm(formData, detailedBioHtml),
    STEP_ROUTES[2],
  );
  redirect(STEP_ROUTES[3]);
}

export async function saveStep3(formData: FormData) {
  const applicationId = String(formData.get("applicationId") ?? "");
  if (!applicationId) throw new Error("Missing applicationId");

  // Fields are named presenter_<idx>_<field>. Phase 1 ships a single primary
  // presenter; multi-presenter UI lands later.
  await mergeStep(
    applicationId,
    step3Schema,
    presentersRawFromForm(formData),
    STEP_ROUTES[3],
  );
  redirect(STEP_ROUTES[4]);
}

export async function saveStep4(formData: FormData) {
  const applicationId = String(formData.get("applicationId") ?? "");
  if (!applicationId) throw new Error("Missing applicationId");

  // Field names are the <QuizFields> contract; the mapping is shared with the
  // admin post-approval quiz editor (lib/admin/course-quiz.ts).
  const quiz = quizFromFormData(formData);

  await mergeStep(applicationId, step4Schema, { quiz }, STEP_ROUTES[4]);
  redirect(STEP_ROUTES[5]);
}

/**
 * Final submit. Validates the merged data fully, decides which credit pool to
 * consumes exactly one application credit atomically, transitions DRAFT ->
 * PENDING, and fires the reviewer notification email (log mode until Resend is
 * wired).
 */
export async function submitApplication(formData: FormData) {
  const applicationId = String(formData.get("applicationId") ?? "");
  const companyId = await getCustomerCompanyId();

  const ip = ((await headers()).get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const submitLimited = rateLimit(`submit:${ip}:${companyId}`, { limit: 20, windowMs: 60 * 60 * 1000 });
  if (!submitLimited.ok) {
    redirect("/company/applications/new/review?error=rate_limited");
  }

  const draft = await prisma.courseApplication.findFirst({
    where: { id: applicationId, companyId, status: "DRAFT" },
    include: { company: { select: { name: true } } },
  });
  if (!draft) throw new Error("Draft not found");

  // Full revalidation: every step's required fields must be present.
  const fullParse = applicationDataSchema.safeParse(draft.applicationData);
  if (!fullParse.success) {
    // "incomplete", not "validation": the failure is across the whole
    // application, so the step we land on would re-derive its own schema and
    // correctly find nothing wrong. StepErrors renders a fixed message for this.
    redirect(`${STEP_ROUTES[0]}?error=incomplete`);
  }
  const fullData = fullParse.data;

  const submittedAt = new Date();
  // Revising after a review decision is free: the credit for this submission
  // line was settled the first time (client decision 2026-07-29). A resubmit
  // clone copies creditChargedAt from its parent; a renewal clone deliberately
  // leaves it null, because a renewal is a new accreditation and is charged.
  const chargeable = draft.creditChargedAt == null;

  // Atomic credit consumption + status transition.
  await prisma.$transaction(async (tx) => {
    // The row lock stays unconditional even when nothing is charged: it also
    // serializes the DRAFT -> PENDING transition below.
    await tx.$executeRaw`select id from public.companies where id = ${companyId}::uuid for update`;

    if (chargeable) {
      const company = await tx.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { applicationCredits: true },
      });

      if (company.applicationCredits > 0) {
        await tx.company.update({
          where: { id: companyId },
          data: { applicationCredits: { decrement: 1 } },
        });
      } else {
        throw new Error("No application credits available");
      }
    }

    // updateMany so we can scope by status — protects against a concurrent
    // second submit (rapid double-click, retried tab) sneaking past the
    // pre-tx findFirst and double-spending a credit. The companyId scope is
    // belt-and-braces; the pre-tx find already enforced it.
    const updated = await tx.courseApplication.updateMany({
      where: { id: applicationId, companyId, status: "DRAFT" },
      data: {
        status: "PENDING",
        courseTitle: fullData.courseTitle,
        ceHours: fullData.ceCreditHours,
        courseType: fullData.subjectMatter,
        deliveryMethod: fullData.deliveryFormat,
        submittedAt,
        // Stamped in the same transaction as the decrement, so a later
        // revision of this application is free.
        ...(chargeable ? { creditChargedAt: submittedAt } : {}),
      },
    });
    if (updated.count !== 1) {
      throw new Error("Application was already submitted");
    }
  });

  // Notify all active Reviewer + Admin accounts (BCC'd) plus any external
  // reviewers in REVIEWER_NOTIFICATION_EMAILS. Log mode until Resend is verified.
  const reviewerEmails = await getReviewerNotificationRecipients();

  if (reviewerEmails.length > 0) {
    const props = {
      recipientName: "AADB Reviewer",
      companyName: draft.company.name,
      courseTitle: fullData.courseTitle,
      ceHours: fullData.ceCreditHours,
      deliveryFormat: fullData.deliveryFormat,
      submittedAt: submittedAt.toLocaleString(),
      reviewUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/reviewer/${applicationId}`,
    };
    try {
      await sendEmail({
        to: reviewerNotificationToAddress(),
        bcc: reviewerEmails,
        subject: ApplicationSubmittedEmail.subject(props),
        react: ApplicationSubmittedEmail(props),
      });
    } catch (err) {
      // Don't fail the submission if email logging hiccups.
      console.error("[submitApplication] reviewer email failed", err);
    }
  }

  revalidatePath("/company");
  redirect("/company/courses?just=submitted");
}

/**
 * Upload a draft attachment (presenter headshot, the only remaining upload
 * field) via the service-role Supabase client. Client posts a multipart form
 * to the route handler at /api/uploads/draft-attachment, which calls into
 * this. Re-validates
 * field + MIME/size (defense in depth) and sanitizes the filename before it
 * reaches the storage path. The fileRef is persisted straight into
 * applicationData; mergeStep preserves it because no step writes these keys.
 */
export async function uploadDraftAttachment(args: {
  applicationId: string;
  field: AttachmentField;
  file: File;
}): Promise<FileRef> {
  const companyId = await getCustomerCompanyId();

  const meta = uploadMetaSchema.parse({
    applicationId: args.applicationId,
    field: args.field,
  });
  const invalid = validateUpload(meta.field, {
    type: args.file.type,
    size: args.file.size,
  });
  if (invalid) throw new Error(invalid);

  const draft = await prisma.courseApplication.findFirst({
    where: { id: meta.applicationId, companyId, status: "DRAFT" },
    select: { id: true, applicationData: true },
  });
  if (!draft) throw new Error("Draft not found");

  const bucket = process.env.SUPABASE_STORAGE_BUCKET_UPLOADS ?? "uploads";
  const storagePath = buildAttachmentPath(draft.id, meta.field, args.file.name, Date.now());

  const supabase = createServiceRoleClient();
  const buffer = Buffer.from(await args.file.arrayBuffer());
  const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
    contentType: args.file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  const fileRef: FileRef = {
    storagePath,
    filename: sanitizeFilename(args.file.name),
    uploadedAt: new Date().toISOString(),
  };

  const mergedAttachments = {
    ...((draft.applicationData as Record<string, unknown>) ?? {}),
    [meta.field]: fileRef,
  };
  await prisma.courseApplication.update({
    where: { id: draft.id },
    data: { applicationData: mergedAttachments as Prisma.InputJsonValue },
  });

  return fileRef;
}
