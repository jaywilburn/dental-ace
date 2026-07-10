import "server-only";
import { createSignedUrl, uploadToStorage } from "@/lib/storage";
import { renderQrPng } from "@/lib/qrcode";
import { renderApprovalLetterPdf } from "@/lib/pdf/approval-letter";
import { appBaseUrl } from "@/lib/app-url";
import { getLetterSignatory } from "@/lib/admin/letter-settings";

/*
  Self-healing signed URLs for the post-approval course assets (attendee QR
  PNG + approval letter PDF) in the private `uploads` bucket.

  The approve action records deterministic storage paths in the DB before the
  render/upload step runs; if that step ever fails, the row points at an object
  that does not exist and the My Courses page used to show "Processing"
  forever. Here, when signing fails because the object is missing, we
  re-render the asset, upload it to the recorded path, and sign again.

  Server-only: storage IO uses the service-role client. Callers MUST have
  already scoped the course to the requesting company (the My Courses query
  filters on companyId) — this module never widens access, it only renders
  from data the caller is entitled to read.

  Renders here are PDFKit + the qrcode package (no Puppeteer), cheap enough to
  run inline during a page render on the rare regeneration miss.
*/

export type AssetIo = {
  /**
   * Sign a stored object. When `download` is set, the URL forces a browser
   * download (Content-Disposition: attachment) with that filename; otherwise
   * the URL renders the object inline (used for <img> thumbnails).
   */
  sign: (path: string, download?: string) => Promise<string>;
  upload: (args: { path: string; body: Buffer; contentType: string }) => Promise<unknown>;
};

const defaultIo: AssetIo = {
  sign: (path, download) =>
    createSignedUrl("uploads", path, 300, download ? { download } : undefined),
  upload: ({ path, body, contentType }) =>
    uploadToStorage({ kind: "uploads", path, body, contentType }),
};

/**
 * Sign a stored asset; if signing fails (object missing), regenerate it at
 * the recorded path and sign again. Returns null only when regeneration also
 * fails — and logs that failure so it surfaces in server logs.
 */
export async function signOrRegenerateAssetUrl(
  path: string,
  render: () => Promise<{ body: Buffer; contentType: string }>,
  io: AssetIo = defaultIo,
): Promise<string | null> {
  try {
    return await io.sign(path);
  } catch {
    // Object missing (post-approval upload failed) — fall through to regenerate.
  }
  try {
    const { body, contentType } = await render();
    await io.upload({ path, body, contentType });
    return await io.sign(path);
  } catch (err) {
    console.error(`[course-assets] regeneration failed (path=${path})`, err);
    return null;
  }
}

/**
 * Sign a stored asset once as an inline "view" URL (for an <img> thumbnail) and
 * derive a download-forcing URL (Content-Disposition: attachment named
 * `downloadName`) from it without a second sign round-trip. The self-heal
 * regeneration runs only while signing the view URL. Returns nulls when the
 * object could not be ensured (path never recorded / regeneration failed);
 * otherwise the download URL is always present.
 *
 * The download URL is derived rather than signed a second time because the
 * Supabase storage client applies the `download` option purely client-side:
 * `createSignedUrl` POSTs only `{ expiresIn }` (plus `transform`) to
 * `/object/sign` and then appends `&download=<filename>` to the returned signed
 * URL string — the signature never covers the download param. Since the view
 * and download URLs share the same path, expiry, and (absent) transform, the
 * download URL is exactly the already-signed view URL with the download query
 * param appended. This saves one Supabase Storage round-trip per QR on every
 * /company/courses and /company/events render.
 */
export async function signViewAndDownloadUrls(
  path: string,
  downloadName: string,
  render: () => Promise<{ body: Buffer; contentType: string }>,
  io: AssetIo = defaultIo,
): Promise<{ viewUrl: string | null; downloadUrl: string | null }> {
  const viewUrl = await signOrRegenerateAssetUrl(path, render, io);
  if (!viewUrl) return { viewUrl: null, downloadUrl: null };
  // Matches the storage client's own encoding (URLSearchParams form-encoding,
  // which encodeURI leaves untouched for the resulting query string).
  const downloadParam = new URLSearchParams({ download: downloadName }).toString();
  return { viewUrl, downloadUrl: `${viewUrl}&${downloadParam}` };
}

export type CourseAssetInput = {
  attendeeLinkToken: string;
  qrCodeUrl: string | null;
  approvalLetterUrl: string | null;
  courseIdNumber: string;
  approvedAt: Date;
  expiresAt: Date;
  companyName: string;
  courseTitle: string;
  ceHours: number;
};

/**
 * Signed URLs for a course's QR + approval letter, regenerating missing objects
 * on demand. The QR yields both an inline `qrViewUrl` (for an <img> thumbnail)
 * and a `qrDownloadUrl` that saves as `${courseIdNumber}-attendee-qr.png`. A
 * null URL means the asset path was never recorded (pre-feature course) or
 * regeneration failed.
 */
export async function courseAssetUrls(
  course: CourseAssetInput,
  io: AssetIo = defaultIo,
): Promise<{
  qrViewUrl: string | null;
  qrDownloadUrl: string | null;
  letterDownloadUrl: string | null;
}> {
  const [qr, letterDownloadUrl] = await Promise.all([
    course.qrCodeUrl
      ? signViewAndDownloadUrls(
          course.qrCodeUrl,
          `${course.courseIdNumber}-attendee-qr.png`,
          // attendeeUrl is built lazily so appBaseUrl() runs only on the rare
          // regeneration miss, not once per course on every page render.
          async () => ({
            body: await renderQrPng(
              `${appBaseUrl()}/attend/${course.attendeeLinkToken}`,
            ),
            contentType: "image/png",
          }),
          io,
        )
      : Promise.resolve({ viewUrl: null, downloadUrl: null }),
    course.approvalLetterUrl
      ? signOrRegenerateAssetUrl(
          course.approvalLetterUrl,
          async () => ({
            body: await renderApprovalLetterPdf({
              companyName: course.companyName,
              courseTitle: course.courseTitle,
              courseIdNumber: course.courseIdNumber,
              ceHours: course.ceHours,
              approvedAt: course.approvedAt,
              expiresAt: course.expiresAt,
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
