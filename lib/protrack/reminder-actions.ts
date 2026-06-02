"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireProtrackPro } from "@/lib/protrack/require-pro";
import type { ReminderKey, ReminderSettings } from "@/lib/protrack/reminders";

/*
  Save a Pro licensee's reminder preferences. Pro-gated server-side: a FREE
  licensee who reaches this action is redirected by requireProtrackPro.
*/
export async function saveReminderSettings(formData: FormData): Promise<void> {
  const user = await requireProtrackPro();

  const keys: ReminderKey[] = ["d90", "d60", "d30", "d7", "categoryGap"];
  const settings = Object.fromEntries(
    keys.map((key) => [key, formData.get(key) === "on"]),
  ) as ReminderSettings;

  await prisma.user.update({
    where: { id: user.id },
    data: { reminderSettings: settings as unknown as Prisma.InputJsonValue },
  });

  revalidatePath("/protrack/reminders");
  redirect("/protrack/reminders?saved=1");
}
