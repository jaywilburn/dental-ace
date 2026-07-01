import "server-only";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/*
  Shared step-merge core for the course-application wizard. Extracted from
  lib/forms/application/actions.ts so BOTH the standalone application wizard and
  the inline event-session sub-wizard (event-only full-course path) validate and
  persist a step the exact same way.

  NOT a "use server" module: it takes a Zod schema argument (non-serializable),
  so it must stay an ordinary server-only function called from server actions,
  never exposed as an RPC action itself.

  Validates `raw` against `schema`; on failure redirects back to `errorRoute`
  with a query-string detail (the step page renders it as a banner). On success
  it merges the parsed slice into the draft's application_data (scoped to the
  owning company + DRAFT status, which covers both standalone and event-scoped
  session drafts) and returns the parsed slice.
*/
export async function mergeApplicationStep<T>(
  applicationId: string,
  companyId: string,
  schema: z.ZodTypeAny,
  raw: unknown,
  errorRoute: string,
): Promise<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const detail = issue
      ? `${String(issue.path[0] ?? "Form")}: ${issue.message}`.slice(0, 200)
      : "Please check the highlighted fields.";
    redirect(`${errorRoute}?error=validation&detail=${encodeURIComponent(detail)}`);
  }
  const parsed = result.data as T;

  const existing = await prisma.courseApplication.findFirst({
    where: { id: applicationId, companyId, status: "DRAFT" },
    select: { applicationData: true },
  });
  if (!existing) throw new Error("Draft not found");

  const merged = {
    ...((existing.applicationData as Record<string, unknown>) ?? {}),
    ...(parsed as Record<string, unknown>),
  };
  await prisma.courseApplication.update({
    where: { id: applicationId },
    data: { applicationData: merged as Prisma.InputJsonValue },
  });

  return parsed;
}
