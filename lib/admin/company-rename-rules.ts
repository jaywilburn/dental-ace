import { companyRegisterSchema } from "@/lib/company/register-schema";

/*
  Pure validation for the admin company-rename action. No DB, no server-only —
  unit-tested directly (mirrors override-rules.ts). Reuses the registration
  name schema so an admin rename can't produce a name self-serve registration
  would reject. Duplicate-name checking stays in the server action, under the
  same advisory lock + case-insensitive lookup registration uses.
*/

export type CompanyRenameValidation =
  | { ok: true; name: string }
  | { ok: false; error: string };

export function validateCompanyRename(
  rawName: string,
  currentName: string,
): CompanyRenameValidation {
  const parsed = companyRegisterSchema.shape.name.safeParse(rawName);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a valid name." };
  }
  if (parsed.data === currentName) {
    return { ok: false, error: "The new name is the same as the current name." };
  }
  return { ok: true, name: parsed.data };
}
