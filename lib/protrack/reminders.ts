/*
  ProTrack reminder settings: which renewal-deadline reminders and category-gap
  alerts a Pro licensee wants. Stored as JSON on licensees.reminder_settings.
  Plain module (no DB) so the cron, the settings page, and the save action all
  share one parser. Default is everything on.
*/

export type ReminderKey = "d90" | "d60" | "d30" | "d7" | "categoryGap";

export type ReminderSettings = Record<ReminderKey, boolean>;

export const DEFAULT_REMINDERS: ReminderSettings = {
  d90: true,
  d60: true,
  d30: true,
  d7: true,
  categoryGap: true,
};

export const RENEWAL_THRESHOLDS: { key: ReminderKey; days: number }[] = [
  { key: "d90", days: 90 },
  { key: "d60", days: 60 },
  { key: "d30", days: 30 },
  { key: "d7", days: 7 },
];

export const REMINDER_LABELS: Record<ReminderKey, string> = {
  d90: "90 days before renewal",
  d60: "60 days before renewal",
  d30: "30 days before renewal",
  d7: "7 days before renewal (final notice)",
  categoryGap: "Missing-category alerts",
};

export function parseReminderSettings(json: unknown): ReminderSettings {
  const settings = { ...DEFAULT_REMINDERS };
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    for (const key of Object.keys(settings) as ReminderKey[]) {
      if (typeof obj[key] === "boolean") settings[key] = obj[key] as boolean;
    }
  }
  return settings;
}
