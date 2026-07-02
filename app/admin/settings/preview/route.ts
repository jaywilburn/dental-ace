import { requireStaff } from "@/lib/auth/session";
import { getLetterSignatory } from "@/lib/admin/letter-settings";
import { renderApprovalLetterPdf } from "@/lib/pdf/approval-letter";

/*
  Admin-only sample approval-letter preview. Renders the letter with the CURRENT
  signatory settings + placeholder course data so an admin can eyeball the
  signature before it reaches a real applicant. GET, inline PDF, never cached.
*/
export async function GET() {
  await requireStaff("ADMIN");
  const signatory = await getLetterSignatory();
  const approvedAt = new Date();
  const expiresAt = new Date(approvedAt);
  expiresAt.setFullYear(expiresAt.getFullYear() + 3);

  const pdf = await renderApprovalLetterPdf({
    companyName: "Sample Dental Association",
    courseTitle: "Sample Continuing Education Course",
    courseIdNumber: "ACE-PREVIEW-0000",
    ceHours: 2,
    approvedAt,
    expiresAt,
    ...signatory,
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="approval-letter-preview.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
