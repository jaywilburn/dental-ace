"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AdminAuditAction } from "@prisma/client";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { uploadToStorage } from "@/lib/storage";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { recordAdminAction } from "@/lib/admin/audit";
import {
  validateSignatory,
  validateSignatureImage,
  signatureExt,
} from "@/lib/admin/letter-settings-rules";
import { isRenderablePdfImage } from "@/lib/pdf/validate-image";

/*
  Admin writes for the platform letter-signatory settings (the president credit
  on the approval letter). Mirrors lib/admin/billing-overrides.ts: guard ->
  validate -> transaction (upsert the singleton + write an AdminAuditLog row in
  the SAME tx) -> revalidate -> redirect with ?ok / ?error. Singleton id
  "singleton". targetUserId is null (a platform-scoped change, not a user).
*/

const SETTINGS_PATH = "/admin/settings";
const UPLOADS_BUCKET = process.env.SUPABASE_STORAGE_BUCKET_UPLOADS ?? "uploads";

export async function updateLetterSignatory(formData: FormData) {
  const admin = await requireStaff("ADMIN");
  const v = validateSignatory(
    String(formData.get("presidentName") ?? ""),
    String(formData.get("presidentTitle") ?? ""),
  );
  if (!v.ok) redirect(`${SETTINGS_PATH}?error=${encodeURIComponent(v.error)}`);

  await prisma.$transaction(async (tx) => {
    await tx.platformSettings.upsert({
      where: { id: "singleton" },
      update: {
        presidentName: v.value.presidentName,
        presidentTitle: v.value.presidentTitle,
        updatedById: admin.id,
      },
      create: {
        id: "singleton",
        presidentName: v.value.presidentName,
        presidentTitle: v.value.presidentTitle,
        updatedById: admin.id,
      },
    });
    await recordAdminAction(tx, {
      actorUserId: admin.id,
      targetUserId: null,
      action: AdminAuditAction.LETTER_SETTINGS_UPDATED,
      summary: `Set approval-letter signatory to "${v.value.presidentName}"`,
      details: {
        presidentName: v.value.presidentName,
        presidentTitle: v.value.presidentTitle,
      },
    });
  });

  revalidatePath(SETTINGS_PATH);
  redirect(`${SETTINGS_PATH}?ok=signatory`);
}

export async function uploadSignatureImage(formData: FormData) {
  const admin = await requireStaff("ADMIN");
  const file = formData.get("signatureImage");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`${SETTINGS_PATH}?error=${encodeURIComponent("Choose a PNG or JPG file.")}`);
  }
  const f = file as File;
  const v = validateSignatureImage(f.type, f.size);
  if (!v.ok) redirect(`${SETTINGS_PATH}?error=${encodeURIComponent(v.error)}`);

  const path = `admin/president-signature.${signatureExt(f.type)}`;
  const body = Buffer.from(await f.arrayBuffer());
  if (!isRenderablePdfImage(body)) {
    redirect(
      `${SETTINGS_PATH}?error=${encodeURIComponent("That image could not be read as a signature. Upload a standard PNG or JPG.")}`,
    );
  }
  await uploadToStorage({ kind: "uploads", path, body, contentType: f.type });

  await prisma.$transaction(async (tx) => {
    await tx.platformSettings.upsert({
      where: { id: "singleton" },
      update: { signatureImagePath: path, signatureImageMime: f.type, updatedById: admin.id },
      create: {
        id: "singleton",
        signatureImagePath: path,
        signatureImageMime: f.type,
        updatedById: admin.id,
      },
    });
    await recordAdminAction(tx, {
      actorUserId: admin.id,
      targetUserId: null,
      action: AdminAuditAction.LETTER_SETTINGS_UPDATED,
      summary: "Uploaded approval-letter signature image",
      details: { signatureImagePath: path, mime: f.type },
    });
  });

  revalidatePath(SETTINGS_PATH);
  redirect(`${SETTINGS_PATH}?ok=image`);
}

export async function removeSignatureImage() {
  const admin = await requireStaff("ADMIN");
  const current = await prisma.platformSettings.findUnique({
    where: { id: "singleton" },
    select: { signatureImagePath: true },
  });
  if (current?.signatureImagePath) {
    try {
      const supabase = createServiceRoleClient();
      await supabase.storage.from(UPLOADS_BUCKET).remove([current.signatureImagePath]);
    } catch (err) {
      console.error("[letter-settings] signature image delete failed", err);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.platformSettings.upsert({
      where: { id: "singleton" },
      update: { signatureImagePath: null, signatureImageMime: null, updatedById: admin.id },
      create: { id: "singleton", updatedById: admin.id },
    });
    await recordAdminAction(tx, {
      actorUserId: admin.id,
      targetUserId: null,
      action: AdminAuditAction.LETTER_SETTINGS_UPDATED,
      summary: "Removed approval-letter signature image (reverted to script font)",
      details: {},
    });
  });

  revalidatePath(SETTINGS_PATH);
  redirect(`${SETTINGS_PATH}?ok=image_removed`);
}
