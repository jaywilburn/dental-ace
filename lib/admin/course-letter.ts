import "server-only";
import { getLetterSignatory } from "@/lib/admin/letter-settings";
import { renderApprovalLetterPdf } from "@/lib/pdf/approval-letter";
import { uploadToStorage } from "@/lib/storage";

/*
  Re-render a course's stored approval letter in place after an admin edit
  (rename, Edit details). The self-heal path in lib/courses/course-assets.ts
  only regenerates a MISSING object, so an existing letter would otherwise keep
  the old title, hours or dates forever.

  Callers capture the job inside their transaction and run this AFTER commit:
  PDF render + storage IO must not hold a row lock, and a failure here must not
  roll back the committed edit. A failure is logged, not surfaced.
*/

export type LetterJob = {
  path: string;
  companyName: string;
  courseTitle: string;
  courseIdNumber: string;
  ceHours: number;
  deliveryMethod: string | null;
  approvedAt: Date;
  expiresAt: Date;
};

export async function rerenderApprovalLetter(
  letter: LetterJob,
  context: { action: string; courseId: string },
): Promise<void> {
  try {
    const body = await renderApprovalLetterPdf({
      companyName: letter.companyName,
      courseTitle: letter.courseTitle,
      courseIdNumber: letter.courseIdNumber,
      ceHours: letter.ceHours,
      deliveryMethod: letter.deliveryMethod,
      approvedAt: letter.approvedAt,
      expiresAt: letter.expiresAt,
      ...(await getLetterSignatory()),
    });
    await uploadToStorage({ kind: "uploads", path: letter.path, body, contentType: "application/pdf" });
  } catch (err) {
    console.error(
      `[${context.action}] approval letter re-render failed (courseId=${context.courseId}, path=${letter.path})`,
      err,
    );
  }
}
