import "server-only";
import { createSignedUrl } from "@/lib/storage";
import type { FileRef } from "@/lib/forms/application/schemas";

/*
  Resolve the optional application attachments into short-lived signed
  download links for display on the review + reviewer screens. A null url means
  the file is recorded but the signed URL could not be issued (still surfaced so
  the reviewer knows something was uploaded).

  Course outline and CV/resume became text fields in 2026-06; on applications
  saved since then those keys hold strings, which are rendered as text rows
  elsewhere. Legacy fileRef objects still resolve to download links here.
*/

export type AttachmentLink = {
  label: string;
  filename: string;
  url: string | null;
};

type AttachmentSource = {
  courseOutline?: FileRef | string;
  detailedBio?: FileRef;
  cvResume?: FileRef | string;
  headshot?: FileRef;
};

/** Narrow a legacy-or-text field to its fileRef form (undefined for text). */
function asFileRef(value: FileRef | string | undefined): FileRef | undefined {
  return typeof value === "object" && value !== null ? value : undefined;
}

export async function resolveAttachmentLinks(
  data: AttachmentSource,
): Promise<AttachmentLink[]> {
  const entries: [string, FileRef | undefined][] = [
    ["Course Outline", asFileRef(data.courseOutline)],
    ["Detailed Bio", data.detailedBio],
    ["CV / Resume", asFileRef(data.cvResume)],
    ["Presenter Headshot", data.headshot],
  ];

  const links = await Promise.all(
    entries.map(async ([label, ref]) =>
      ref
        ? {
            label,
            filename: ref.filename,
            url: await createSignedUrl("uploads", ref.storagePath).catch(() => null),
          }
        : null,
    ),
  );

  return links.filter((l): l is AttachmentLink => l !== null);
}
