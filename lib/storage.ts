import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/*
  Server-only Supabase Storage helpers. Service-role only — keep on the server.

  uploadToStorage writes a Buffer to the configured bucket and returns the
  storage path. createSignedUrl issues a short-lived download URL for clients
  to fetch private assets.
*/

const certsBucket = () => process.env.SUPABASE_STORAGE_BUCKET_CERTS ?? "certificates";
const uploadsBucket = () => process.env.SUPABASE_STORAGE_BUCKET_UPLOADS ?? "uploads";

export type BucketKind = "certs" | "uploads";

function bucketName(kind: BucketKind): string {
  return kind === "certs" ? certsBucket() : uploadsBucket();
}

export async function uploadToStorage(args: {
  kind: BucketKind;
  path: string;
  body: Buffer;
  contentType: string;
}): Promise<{ storagePath: string }> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.storage
    .from(bucketName(args.kind))
    .upload(args.path, args.body, {
      contentType: args.contentType,
      upsert: true,
    });
  if (error) throw new Error(`Storage upload failed (${args.path}): ${error.message}`);
  return { storagePath: args.path };
}

export async function createSignedUrl(
  kind: BucketKind,
  path: string,
  expiresIn = 300,
  options?: {
    /**
     * When set, the signed URL forces a download (Content-Disposition:
     * attachment) instead of rendering inline. Pass a string to override the
     * downloaded filename, or true to keep the stored object name.
     */
    download?: boolean | string;
  },
): Promise<string> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage
    .from(bucketName(kind))
    .createSignedUrl(path, expiresIn, options);
  if (error || !data?.signedUrl) {
    throw new Error(`Signed URL failed (${path}): ${error?.message ?? "no URL"}`);
  }
  return data.signedUrl;
}
