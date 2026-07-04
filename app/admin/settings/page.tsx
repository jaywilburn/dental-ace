import { PageHeader } from "@/components/portal-shell";
import { requireStaff } from "@/lib/auth/session";
import { getLetterSettingsRow } from "@/lib/admin/letter-settings";
import { createSignedUrl } from "@/lib/storage";
import {
  updateLetterSignatory,
  uploadSignatureImage,
  removeSignatureImage,
} from "@/lib/admin/letter-settings-actions";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireStaff("ADMIN");
  const { ok, error } = await searchParams;
  const settings = await getLetterSettingsRow();

  let signatureUrl: string | null = null;
  if (settings.signatureImagePath) {
    try {
      signatureUrl = await createSignedUrl("uploads", settings.signatureImagePath, 300);
    } catch {
      signatureUrl = null;
    }
  }

  return (
    <>
      <PageHeader title="Platform Settings" subtitle="Approval-letter signatory" />
      {ok ? (
        <div className="mb-4 rounded-md border border-emerald-400 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-700">
          Settings saved.
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-md border border-red-400 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <form
          action={updateLetterSignatory}
          className="rounded-lg border border-border bg-white p-4 space-y-3"
        >
          <p className="text-[12px] font-semibold text-navy">
            President (approval-letter signatory)
          </p>
          <label className="block text-[11px] font-medium text-text-muted">
            Name
            <input
              type="text"
              name="presidentName"
              defaultValue={settings.presidentName}
              maxLength={120}
              required
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-[13px]"
            />
          </label>
          <label className="block text-[11px] font-medium text-text-muted">
            Title
            <input
              type="text"
              name="presidentTitle"
              defaultValue={settings.presidentTitle}
              maxLength={160}
              required
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-[13px]"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-navy px-3 py-1.5 text-[12px] font-semibold text-white"
          >
            Save signatory
          </button>
        </form>

        <div className="rounded-lg border border-border bg-white p-4 space-y-3">
          <p className="text-[12px] font-semibold text-navy">Signature image</p>
          {signatureUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signatureUrl}
                alt="Current signature"
                className="h-16 w-auto border border-border bg-surface p-1"
              />
              <form action={removeSignatureImage}>
                <button
                  type="submit"
                  className="rounded-md border border-border px-3 py-1.5 text-[12px] font-semibold text-text-mid"
                >
                  Remove image (use script-font signature)
                </button>
              </form>
            </>
          ) : (
            <p className="text-[11px] text-text-muted">
              No image uploaded. The president name renders in a script font as the signature.
            </p>
          )}
          <form action={uploadSignatureImage} className="space-y-2">
            <input
              type="file"
              name="signatureImage"
              accept="image/png,image/jpeg"
              required
              className="block w-full text-[12px]"
            />
            <p className="text-[11px] text-text-muted">
              PNG or JPG, under 1 MB. Replaces the script-font signature.
            </p>
            <button
              type="submit"
              className="rounded-md bg-navy px-3 py-1.5 text-[12px] font-semibold text-white"
            >
              Upload signature
            </button>
          </form>
        </div>
      </div>

      <div className="mt-5">
        <a
          href="/admin/settings/preview"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-md border border-navy px-3 py-1.5 text-[12px] font-semibold text-navy"
        >
          Preview sample letter (PDF)
        </a>
      </div>
    </>
  );
}
