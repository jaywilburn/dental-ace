import "server-only";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sanitizeEcho } from "@/lib/forms/draft-echo";

/*
  Shared step-merge core for the course-application wizard. Extracted from
  lib/forms/application/actions.ts so BOTH the standalone application wizard and
  the inline event-session sub-wizard (event-only full-course path) validate and
  persist a step the exact same way.

  NOT a "use server" module: it takes a Zod schema argument (non-serializable),
  so it must stay an ordinary server-only function called from server actions,
  never exposed as an RPC action itself.

  On SUCCESS it merges the parsed slice into the draft's application_data
  (scoped to the owning company + DRAFT status, which covers both standalone and
  event-scoped session drafts) and returns the parsed slice.

  On FAILURE it persists the RAW slice instead, then redirects back to
  `errorRoute` with ?error=validation. The step page re-renders from the draft,
  so the provider sees everything they typed, and re-derives the messages by
  parsing that draft with the same schema (lib/forms/field-errors.ts). Before
  2026-07-29 this path redirected WITHOUT writing anything, so the page
  re-rendered from an empty draft and silently erased the whole screen.

  TWO RULES for anyone editing this:
    1. Never move these writes inside a prisma.$transaction. redirect() throws
       NEXT_REDIRECT, which would abort the transaction and roll the echo back,
       reintroducing the exact data-loss bug this exists to fix.
    2. Never wrap a call to this in a bare try/catch: it would swallow
       NEXT_REDIRECT. Use unstable_rethrow from next/navigation if you must.
*/
export async function mergeApplicationStep<T>(
  applicationId: string,
  companyId: string,
  schema: z.ZodTypeAny,
  raw: unknown,
  errorRoute: string,
): Promise<T> {
  const existing = await prisma.courseApplication.findFirst({
    where: { id: applicationId, companyId, status: "DRAFT" },
    select: { applicationData: true },
  });
  if (!existing) throw new Error("Draft not found");
  const current = (existing.applicationData as Record<string, unknown>) ?? {};

  const result = schema.safeParse(raw);
  if (!result.success) {
    // Echo the raw slice so nothing the provider typed is lost. The ownership
    // predicate rides on the write itself (no TOCTOU window), and the awaited
    // update completes before redirect() throws.
    const echo = sanitizeEcho(raw);
    await prisma.courseApplication.updateMany({
      where: { id: applicationId, companyId, status: "DRAFT" },
      data: {
        applicationData: { ...current, ...echo.value } as Prisma.InputJsonValue,
      },
    });
    redirect(`${errorRoute}?error=${echo.truncated ? "too_long" : "validation"}`);
  }
  const parsed = result.data as T;

  const merged = {
    ...current,
    ...(parsed as Record<string, unknown>),
  };
  await prisma.courseApplication.update({
    where: { id: applicationId },
    data: { applicationData: merged as Prisma.InputJsonValue },
  });

  return parsed;
}
