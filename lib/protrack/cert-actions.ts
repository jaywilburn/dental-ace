"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CertSource, VerificationStatus, DeliveryFormat } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { uploadToStorage } from "@/lib/storage";
import { ACCREDITATIONS, type CertActionState } from "@/lib/protrack/cert-options";

/*
  Manual CE certificate upload for a licensee. Validates with Zod, stores the
  optional PDF/image in the private `uploads` bucket via the service-role client,
  and writes a ce_certificates row. ADA CERP / AGD PACE accreditations are
  auto-accepted; anything else lands as PENDING.

  Returns field-level errors for inline display; redirects to the certificates
  list on success. Form option constants + the return type live in
  ./cert-options because a "use server" file may only export async functions.
*/

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

const uploadSchema = z.object({
  courseTitle: z.string().trim().min(3, "Course name is required").max(200),
  provider: z.string().trim().min(2, "Provider is required").max(200),
  accreditationType: z.enum(ACCREDITATIONS, {
    message: "Select an accreditation type",
  }),
  // Free-form string (not an enum): the offered options come from the user's
  // own state-requirement categories, which vary by state and license type.
  category: z.string().trim().min(1, "Select a CE category").max(100),
  hours: z.coerce
    .number({ message: "Enter the CE hours" })
    .min(0.5, "At least 0.5 hours")
    .max(100, "That is too many hours"),
  completedAt: z.coerce.date({ message: "Enter the completion date" }),
  deliveryFormat: z.enum(
    [DeliveryFormat.IN_PERSON, DeliveryFormat.ONLINE, DeliveryFormat.HYBRID],
    { message: "Select a delivery format" },
  ),
  certNumber: z.string().trim().max(100).optional(),
});

function accreditationToSource(acc: (typeof ACCREDITATIONS)[number]): {
  source: CertSource;
  verification: VerificationStatus;
} {
  switch (acc) {
    case "ADA_CERP":
      return {
        source: CertSource.ADA_CERP,
        verification: VerificationStatus.ADA_CERP_ACCEPTED,
      };
    case "AGD_PACE":
      return {
        source: CertSource.AGD_PACE,
        verification: VerificationStatus.AGD_PACE_ACCEPTED,
      };
    default:
      return {
        source: CertSource.UPLOADED,
        verification: VerificationStatus.PENDING,
      };
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

export async function uploadCertificate(
  _prev: CertActionState,
  formData: FormData,
): Promise<CertActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = uploadSchema.safeParse({
    courseTitle: formData.get("courseTitle"),
    provider: formData.get("provider"),
    accreditationType: formData.get("accreditationType"),
    category: formData.get("category"),
    hours: formData.get("hours"),
    completedAt: formData.get("completedAt"),
    deliveryFormat: formData.get("deliveryFormat"),
    certNumber: formData.get("certNumber") || undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors };
  }

  const data = parsed.data;

  // Optional file → uploads bucket (service-role).
  let fileUrl: string | null = null;
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE_BYTES) {
      return { error: "File must be under 10MB." };
    }
    try {
      const path = `protrack/certificates/${user.id}/${Date.now()}-${sanitizeFilename(file.name)}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await uploadToStorage({
        kind: "uploads",
        path,
        body: buffer,
        contentType: file.type || "application/octet-stream",
      });
      fileUrl = path;
    } catch {
      return { error: "Could not upload the file. Please try again." };
    }
  }

  const { source, verification } = accreditationToSource(data.accreditationType);

  await prisma.ceCertificate.create({
    data: {
      licenseeId: user.id,
      courseTitle: data.courseTitle,
      provider: data.provider,
      source,
      category: data.category,
      hours: data.hours,
      deliveryFormat: data.deliveryFormat,
      completedAt: data.completedAt,
      verificationStatus: verification,
      certNumber: data.certNumber || null,
      fileUrl,
    },
  });

  revalidatePath("/protrack");
  revalidatePath("/protrack/certificates");
  redirect("/protrack/certificates");
}
