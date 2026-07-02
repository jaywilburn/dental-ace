import "server-only";
import { renderQrPng } from "@/lib/qrcode";
import { renderApprovalLetterPdf } from "@/lib/pdf/approval-letter";
import { appBaseUrl } from "@/lib/app-url";
import { signOrRegenerateAssetUrl } from "@/lib/courses/course-assets";
import { getLetterSignatory } from "@/lib/admin/letter-settings";

/*
  Self-healing signed URLs for an approved event's QR + approval letter, mirroring
  lib/courses/course-assets.ts. The approve action records deterministic paths;
  if the post-commit upload ever failed, signing regenerates the asset on demand.

  Server-only: storage IO uses the service-role client. The caller must already
  have scoped the event to the requesting company.
*/

export type EventAssetInput = {
  attendeeLinkToken: string;
  qrCodeUrl: string | null;
  approvalLetterUrl: string | null;
  eventIdNumber: string;
  eventName: string;
  companyName: string;
  totalHours: number;
  approvedAt: Date;
  expiresAt: Date;
};

export async function eventAssetUrls(
  event: EventAssetInput,
): Promise<{ qrDownloadUrl: string | null; letterDownloadUrl: string | null }> {
  const [qrDownloadUrl, letterDownloadUrl] = await Promise.all([
    event.qrCodeUrl
      ? signOrRegenerateAssetUrl(event.qrCodeUrl, async () => ({
          body: await renderQrPng(
            `${appBaseUrl()}/attend/event/${event.attendeeLinkToken}`,
          ),
          contentType: "image/png",
        }))
      : null,
    event.approvalLetterUrl
      ? signOrRegenerateAssetUrl(event.approvalLetterUrl, async () => ({
          body: await renderApprovalLetterPdf({
            companyName: event.companyName,
            courseTitle: event.eventName,
            courseIdNumber: event.eventIdNumber,
            ceHours: event.totalHours,
            approvedAt: event.approvedAt,
            expiresAt: event.expiresAt,
            ...(await getLetterSignatory()),
          }),
          contentType: "application/pdf",
        }))
      : null,
  ]);

  return { qrDownloadUrl, letterDownloadUrl };
}
