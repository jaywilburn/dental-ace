import "server-only";
import { createSignedUrl } from "@/lib/storage";
import type { FileRef } from "@/lib/forms/application/schemas";

/*
  Resolve the three optional application attachments into short-lived signed
  download links for display on the review + reviewer screens. A null url means
  the file is recorded but the signed URL could not be issued (still surfaced so
  the reviewer knows something was uploaded).
*/

export type AttachmentLink = {
  label: string;
  filename: string;
  url: string | null;
};

type AttachmentSource = {
  courseOutline?: FileRef;
  detailedBio?: FileRef;
  cvResume?: FileRef;
  headshot?: FileRef;
};

export async function resolveAttachmentLinks(
  data: AttachmentSource,
): Promise<AttachmentLink[]> {
  const entries: [string, FileRef | undefined][] = [
    ["Course Outline", data.courseOutline],
    ["Detailed Bio", data.detailedBio],
    ["CV / Resume", data.cvResume],
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
