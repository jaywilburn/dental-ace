import "server-only";
import { prisma } from "@/lib/prisma";
import { downloadFromStorage } from "@/lib/storage";

/*
  Read helpers for the platform letter-signatory settings (the president credit
  on the approval letter). The single PlatformSettings row (id "singleton") is
  lazily created with schema defaults on first read, so no seed/migration data
  step is required and existing environments render with the default president.

  Writes live in lib/admin/letter-settings-actions.ts ("use server").
*/

export type LetterSettingsRow = {
  presidentName: string;
  presidentTitle: string;
  signatureImagePath: string | null;
  signatureImageMime: string | null;
};

export type LetterSignatory = {
  presidentName: string;
  presidentTitle: string;
  signatureImage: Buffer | null;
};

/** Lazily upsert + return the singleton settings row. */
export async function getLetterSettingsRow(): Promise<LetterSettingsRow> {
  return prisma.platformSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
    select: {
      presidentName: true,
      presidentTitle: true,
      signatureImagePath: true,
      signatureImageMime: true,
    },
  });
}

/**
 * The signatory block for renderApprovalLetterPdf: president name + title, plus
 * the uploaded signature image bytes when one exists. A missing/failed image
 * download degrades to null (the renderer then draws a script-font signature)
 * and never throws — letter generation must not break on a storage hiccup.
 */
export async function getLetterSignatory(): Promise<LetterSignatory> {
  const row = await getLetterSettingsRow();
  let signatureImage: Buffer | null = null;
  if (row.signatureImagePath) {
    try {
      signatureImage = await downloadFromStorage({
        kind: "uploads",
        path: row.signatureImagePath,
      });
    } catch (err) {
      console.error("[letter-settings] signature image download failed", err);
      signatureImage = null;
    }
  }
  return {
    presidentName: row.presidentName,
    presidentTitle: row.presidentTitle,
    signatureImage,
  };
}
