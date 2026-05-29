"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  applicationDataSchema,
  type ApplicationData,
} from "@/lib/forms/application/schemas";
import { sendEmail } from "@/lib/email/send";
import ApplicationSubmittedEmail from "@/emails/application-submitted";

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
  "/company/applications/new",
  "/company/applications/new/creator",
  "/company/applications/new/presenters",
  "/company/applications/new/quiz",
  "/company/applications/new/review",
] as const;

async function getCustomerCompanyId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user || user.role !== "CUSTOMER" || !user.companyId) {
    redirect("/login");
  }
  return user.companyId;
}

/** Find the customer's current DRAFT application or create a new one. */
export async function ensureDraft(): Promise<string> {
  const companyId = await getCustomerCompanyId();

  const existing = await prisma.courseApplication.findFirst({
    where: { companyId, status: "DRAFT" },
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

async function mergeStep<T>(
  applicationId: string,
  schema: z.ZodTypeAny,
  raw: unknown,
): Promise<T> {
  const companyId = await getCustomerCompanyId();
  const parsed = schema.parse(raw) as T;

  const existing = await prisma.courseApplication.findFirst({
    where: { id: applicationId, companyId, status: "DRAFT" },
    select: { applicationData: true },
  });
  if (!existing) throw new Error("Draft not found");

  const merged = {
    ...((existing.applicationData as Record<string, unknown>) ?? {}),
    ...(parsed as Record<string, unknown>),
  };
  await prisma.courseApplication.update({
    where: { id: applicationId },
    data: { applicationData: merged as Prisma.InputJsonValue },
  });

  return parsed;
}

export async function saveStep1(formData: FormData) {
  const applicationId = String(formData.get("applicationId") ?? "");
  if (!applicationId) throw new Error("Missing applicationId");

  const raw = {
    courseTitle: String(formData.get("courseTitle") ?? ""),
    ceCreditHours: Number(formData.get("ceCreditHours") ?? 0),
    subjectMatter: String(formData.get("subjectMatter") ?? ""),
    deliveryFormat: String(formData.get("deliveryFormat") ?? ""),
    courseDurationHours: Number(formData.get("courseDurationHours") ?? 0),
    combinedCert: formData.get("combinedCert") === "yes" ? true : formData.get("combinedCert") === "no" ? false : undefined,
    submitSessionsSeparately:
      formData.get("submitSessionsSeparately") === "yes"
        ? true
        : formData.get("submitSessionsSeparately") === "no"
          ? false
          : undefined,
    publicProtectionStatement: String(formData.get("publicProtectionStatement") ?? ""),
    courseObjectives: String(formData.get("courseObjectives") ?? ""),
    targetAudience: String(formData.get("targetAudience") ?? ""),
    adaCerpCategory: String(formData.get("adaCerpCategory") ?? ""),
  };
  await mergeStep(applicationId, step1Schema, raw);
  redirect(STEP_ROUTES[1]);
}

export async function saveStep2(formData: FormData) {
  const applicationId = String(formData.get("applicationId") ?? "");
  if (!applicationId) throw new Error("Missing applicationId");
  const raw = {
    creatorName: String(formData.get("creatorName") ?? ""),
    credentials: String(formData.get("credentials") ?? ""),
    currentPosition: String(formData.get("currentPosition") ?? ""),
    professionalBio: String(formData.get("professionalBio") ?? ""),
  };
  await mergeStep(applicationId, step2Schema, raw);
  redirect(STEP_ROUTES[2]);
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
    },
  ];
  await mergeStep(applicationId, step3Schema, { presenters });
  redirect(STEP_ROUTES[3]);
}

export async function saveStep4(formData: FormData) {
  const applicationId = String(formData.get("applicationId") ?? "");
  if (!applicationId) throw new Error("Missing applicationId");

  const quiz = [
    {
      type: "TF" as const,
      question: String(formData.get("q1_question") ?? ""),
      correctAnswer: (formData.get("q1_correct") === "True" ? "True" : "False") as
        | "True"
        | "False",
    },
    {
      type: "TF" as const,
      question: String(formData.get("q2_question") ?? ""),
      correctAnswer: (formData.get("q2_correct") === "True" ? "True" : "False") as
        | "True"
        | "False",
    },
    ...[2, 3, 4].map((i) => ({
      type: "MC" as const,
      question: String(formData.get(`q${i + 1}_question`) ?? ""),
      options: [0, 1, 2, 3].map((j) => String(formData.get(`q${i + 1}_option_${j}`) ?? "")),
      correctIndex: Number(formData.get(`q${i + 1}_correct`) ?? 0),
    })),
  ];

  await mergeStep(applicationId, step4Schema, { quiz });
  redirect(STEP_ROUTES[4]);
}

/**
 * Final submit. Validates the merged data fully, decides which credit pool to
 * spend (expedited if the company has any + the customer opted in), consumes
 * exactly one credit atomically, transitions DRAFT -> PENDING, and fires the
 * reviewer notification email (log mode until Resend is wired).
 */
export async function submitApplication(formData: FormData) {
  const applicationId = String(formData.get("applicationId") ?? "");
  const useExpedited = formData.get("useExpedited") === "true";
  const companyId = await getCustomerCompanyId();

  const draft = await prisma.courseApplication.findFirst({
    where: { id: applicationId, companyId, status: "DRAFT" },
    include: { company: { select: { name: true } } },
  });
  if (!draft) throw new Error("Draft not found");

  // Full revalidation: every step's required fields must be present.
  const fullData = applicationDataSchema.parse(draft.applicationData);

  const submittedAt = new Date();

  // Atomic credit consumption + status transition.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select id from public.companies where id = ${companyId}::uuid for update`;

    const company = await tx.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { applicationCredits: true, expeditedCredits: true },
    });

    if (useExpedited && company.expeditedCredits > 0) {
      await tx.company.update({
        where: { id: companyId },
        data: { expeditedCredits: { decrement: 1 } },
      });
    } else if (company.applicationCredits > 0) {
      await tx.company.update({
        where: { id: companyId },
        data: { applicationCredits: { decrement: 1 } },
      });
    } else {
      throw new Error("No application credits available");
    }

    await tx.courseApplication.update({
      where: { id: applicationId },
      data: {
        status: "PENDING",
        courseTitle: fullData.courseTitle,
        ceHours: fullData.ceCreditHours,
        courseType: fullData.subjectMatter,
        deliveryMethod: fullData.deliveryFormat,
        isExpedited: useExpedited && company.expeditedCredits > 0,
        submittedAt,
      },
    });
  });

  // Fire reviewer notification email (log mode until Resend domain is verified).
  const reviewerEmails = (process.env.REVIEWER_NOTIFICATION_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (reviewerEmails.length > 0) {
    try {
      await sendEmail({
        to: reviewerEmails,
        subject: ApplicationSubmittedEmail.subject({
          recipientName: "AADB Reviewer",
          companyName: draft.company.name,
          courseTitle: fullData.courseTitle,
          ceHours: fullData.ceCreditHours,
          deliveryFormat: fullData.deliveryFormat,
          submittedAt: submittedAt.toLocaleString(),
          isExpedited: useExpedited,
          reviewUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/reviewer/${applicationId}`,
        }),
        react: ApplicationSubmittedEmail({
          recipientName: "AADB Reviewer",
          companyName: draft.company.name,
          courseTitle: fullData.courseTitle,
          ceHours: fullData.ceCreditHours,
          deliveryFormat: fullData.deliveryFormat,
          submittedAt: submittedAt.toLocaleString(),
          isExpedited: useExpedited,
          reviewUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/reviewer/${applicationId}`,
        }),
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
 * Upload a draft attachment (course outline PDF, CV PDF, headshot image) via
 * the service-role Supabase client. Client posts a multipart form to the
 * route handler at /api/uploads/draft-attachment, which calls into this.
 */
export async function uploadDraftAttachment(args: {
  applicationId: string;
  field: "courseOutline" | "cvResume" | "headshot";
  file: File;
}): Promise<{ storagePath: string }> {
  const companyId = await getCustomerCompanyId();
  const draft = await prisma.courseApplication.findFirst({
    where: { id: args.applicationId, companyId, status: "DRAFT" },
    select: { id: true, applicationData: true },
  });
  if (!draft) throw new Error("Draft not found");

  const bucket = process.env.SUPABASE_STORAGE_BUCKET_UPLOADS ?? "uploads";
  const storagePath = `applications/${draft.id}/${args.field}/${Date.now()}-${args.file.name}`;

  const supabase = createServiceRoleClient();
  const buffer = Buffer.from(await args.file.arrayBuffer());
  const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
    contentType: args.file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  const fileRef = {
    storagePath,
    filename: args.file.name,
    uploadedAt: new Date().toISOString(),
  };

  const mergedAttachments = {
    ...((draft.applicationData as Record<string, unknown>) ?? {}),
    [args.field]: fileRef,
  };
  await prisma.courseApplication.update({
    where: { id: draft.id },
    data: { applicationData: mergedAttachments as Prisma.InputJsonValue },
  });

  return { storagePath };
}
