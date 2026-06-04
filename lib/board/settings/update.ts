"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireBoard } from "@/lib/board/scope";
import { boardSettingsSchema } from "@/lib/board/settings/schema";

/*
  Update the board's identity + cron toggles. One server action — Zod parses
  the FormData, the JSON column is rewritten wholesale (we own all keys, so
  no merge is needed). The cron handlers re-read `board.settings` each run,
  so changes take effect on the next nightly tick without a restart.
*/

export async function updateBoardSettings(formData: FormData): Promise<void> {
  const { board } = await requireBoard();

  const parsed = boardSettingsSchema.safeParse({
    name: formData.get("name"),
    adminEmail: formData.get("adminEmail") ?? "",
    dailySummaryEmail: formData.get("dailySummaryEmail") ?? "",
    defaultSamplePercent: formData.get("defaultSamplePercent"),
    deficiencyResponseDays: formData.get("deficiencyResponseDays"),
    // FormData checkboxes: "on" when checked, missing when unchecked. Coerce
    // booleans inside the schema; here we just normalize the "missing" path.
    autoFollowup30d: formData.get("autoFollowup30d") === "on",
    autoFinal7d: formData.get("autoFinal7d") === "on",
    publicLookupEnabled: formData.get("publicLookupEnabled") === "on",
    dailySummaryEnabled: formData.get("dailySummaryEnabled") === "on",
  });

  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Check the settings form.";
    redirect(`/board/settings?error=${encodeURIComponent(msg)}`);
  }

  const input = parsed.data;
  const settings = {
    defaultSamplePercent: input.defaultSamplePercent,
    deficiencyResponseDays: input.deficiencyResponseDays,
    autoFollowup30d: input.autoFollowup30d,
    autoFinal7d: input.autoFinal7d,
    publicLookupEnabled: input.publicLookupEnabled,
    dailySummaryEnabled: input.dailySummaryEnabled,
  };

  await prisma.board.update({
    where: { id: board.id },
    data: {
      name: input.name,
      adminEmail: input.adminEmail,
      dailySummaryEmail: input.dailySummaryEmail,
      settings: settings as Prisma.InputJsonValue,
    },
  });

  revalidatePath("/board");
  revalidatePath("/board/settings");
  redirect("/board/settings?saved=1");
}
