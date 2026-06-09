import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { uploadDraftAttachment } from "@/lib/forms/application/actions";
import {
  uploadMetaSchema,
  validateUpload,
  type AttachmentField,
} from "@/lib/forms/application/upload-schema";

/*
  Multipart upload endpoint for course-application attachments. The client posts
  { applicationId, field, file }; we auth the DentalACE customer, validate the
  field + MIME/size at the boundary, then hand off to uploadDraftAttachment
  (which re-validates and enforces draft ownership before writing to Storage).
  Node runtime: the service-role upload + Buffer work needs Node, not edge.
*/
export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !user.companyId) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid form data." }, { status: 400 });
  }

  const meta = uploadMetaSchema.safeParse({
    applicationId: form.get("applicationId"),
    field: form.get("field"),
  });
  if (!meta.success) {
    return NextResponse.json({ ok: false, error: "Invalid upload request." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "No file provided." }, { status: 400 });
  }

  const invalid = validateUpload(meta.data.field as AttachmentField, {
    type: file.type,
    size: file.size,
  });
  if (invalid) {
    return NextResponse.json({ ok: false, error: invalid }, { status: 400 });
  }

  try {
    const fileRef = await uploadDraftAttachment({
      applicationId: meta.data.applicationId,
      field: meta.data.field as AttachmentField,
      file,
    });
    return NextResponse.json({ ok: true, fileRef });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
