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
  step2Schema,
  step3Schema,
  step4Schema,
  applicationDataSchema,
  type ApplicationData,
  type FileRef,
} from "@/lib/forms/application/schemas";
import {
  uploadMetaSchema,
  validateUpload,
  sanitizeFilename,
  buildAttachmentPath,
  type AttachmentField,
} from "@/lib/forms/application/upload-schema";
import {
  sanitizeRichText,
  richTextPlainLength,
} from "@/lib/forms/application/rich-text";
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

  const raw = {
    organizationName: String(formData.get("organizationName") ?? ""),
    organizationAddress: String(formData.get("organizationAddress") ?? ""),
    adminName: String(formData.get("adminName") ?? ""),
    adminEmail: String(formData.get("adminEmail") ?? ""),
    adminPhone: String(formData.get("adminPhone") ?? ""),
  };
  await mergeStep(applicationId, orgStepSchema, raw, STEP_ROUTES[0]);
  redirect(STEP_ROUTES[1]);
}

export async function saveStep1(formData: FormData) {
  const applicationId = String(formData.get("applicationId") ?? "");
  if (!applicationId) throw new Error("Missing applicationId");

  const raw = {
    courseTitle: String(formData.get("courseTitle") ?? ""),
    ceCreditHours: Number(formData.get("ceCreditHours") ?? 0),
    subjectMatter: String(formData.get("subjectMatter") ?? ""),
    deliveryFormat: String(formData.get("deliveryFormat") ?? ""),
    primaryDistributionFormat: String(formData.get("primaryDistributionFormat") ?? ""),
    shortDescription: String(formData.get("shortDescription") ?? ""),
    publicProtectionStatement: String(formData.get("publicProtectionStatement") ?? ""),
    courseObjectives: String(formData.get("courseObjectives") ?? ""),
    courseOutline: String(formData.get("courseOutline") ?? ""),
  };
  await mergeStep(applicationId, step1Schema, raw, STEP_ROUTES[1]);
  redirect(STEP_ROUTES[2]);
}

export async function saveStep2(formData: FormData) {
  const applicationId = String(formData.get("applicationId") ?? "");
  if (!applicationId) throw new Error("Missing applicationId");
  // The rich-text bio is sanitized before validation or storage; the visible
  // text (tags stripped) must meet the same 20-character floor the old
  // plain-text bio had.
  const detailedBioHtml = sanitizeRichText(
    String(formData.get("detailedBioHtml") ?? ""),
  );
  if (richTextPlainLength(detailedBioHtml) < 20) {
    redirect(
      `${STEP_ROUTES[2]}?error=validation&detail=${encodeURIComponent(
        "Detailed bio: please write at least 20 characters.",
      )}`,
    );
  }

  const raw = {
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
  await mergeStep(applicationId, step2Schema, raw, STEP_ROUTES[2]);
  redirect(STEP_ROUTES[3]);
}

export async function saveStep3(formData: FormData) {
  const applicationId = String(formData.get("applicationId") ?? "");
  if (!applicationId) throw new Error("Missing applicationId");

  // We expect form fields named presenter_<idx>_<field>. For simplicity Phase 1
  // ships a single primary presenter; multi-presenter UI lands later.
  const presenters = [
    {
      name: String(formData.get("presenter_0_name") ?? ""),
      role: String(formData.get("presenter_0_role") ?? "Primary Presenter"),
      commercialDisclosure: String(formData.get("presenter_0_commercialDisclosure") ?? ""),
      experience: String(formData.get("presenter_0_experience") ?? ""),
      training: String(formData.get("presenter_0_training") ?? ""),
      bio: String(formData.get("presenter_0_bio") ?? ""),
    },
  ];
  await mergeStep(applicationId, step3Schema, { presenters }, STEP_ROUTES[3]);
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
    redirect(
      `${STEP_ROUTES[0]}?error=validation&detail=${encodeURIComponent(
        "Some required fields are missing or incomplete. Walk through each step and re-save.",
      )}`,
    );
  }
  const fullData = fullParse.data;

  const submittedAt = new Date();

  // Atomic credit consumption + status transition.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select id from public.companies where id = ${companyId}::uuid for update`;

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
