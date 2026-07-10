import "server-only";
import { renderQrPng } from "@/lib/qrcode";
import { renderApprovalLetterPdf } from "@/lib/pdf/approval-letter";
import { appBaseUrl } from "@/lib/app-url";
import {
  signOrRegenerateAssetUrl,
  signViewAndDownloadUrls,
  type AssetIo,
} from "@/lib/courses/course-assets";
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

/**
 * Signed URLs for an approved event's QR + approval letter. The QR yields both
 * an inline `qrViewUrl` (for an <img> thumbnail) and a `qrDownloadUrl` that
 * saves as `${eventIdNumber}-attendee-qr.png`. Mirrors courseAssetUrls.
 */
export async function eventAssetUrls(
  event: EventAssetInput,
  io?: AssetIo,
): Promise<{
  qrViewUrl: string | null;
  qrDownloadUrl: string | null;
  letterDownloadUrl: string | null;
}> {
  const [qr, letterDownloadUrl] = await Promise.all([
    event.qrCodeUrl
      ? signViewAndDownloadUrls(
          event.qrCodeUrl,
          `${event.eventIdNumber}-attendee-qr.png`,
          async () => ({
            body: await renderQrPng(
              `${appBaseUrl()}/attend/event/${event.attendeeLinkToken}`,
            ),
            contentType: "image/png",
          }),
          io,
        )
      : Promise.resolve({ viewUrl: null, downloadUrl: null }),
    event.approvalLetterUrl
      ? signOrRegenerateAssetUrl(
          event.approvalLetterUrl,
          async () => ({
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
          }),
          io,
        )
      : null,
  ]);

  return {
    qrViewUrl: qr.viewUrl,
    qrDownloadUrl: qr.downloadUrl,
    letterDownloadUrl,
  };
}
