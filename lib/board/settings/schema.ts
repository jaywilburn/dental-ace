import { z } from "zod";

/*
  Board settings shape. The keys in `settings` are the ones the cron handlers
  read (verify-deficiency-check, verify-board-summary) plus the public-lookup
  toggle and the deadline default used by the notice composer.

  Booleans from FormData arrive as "on" (checked) or missing (unchecked) — we
  preprocess via .pipe(z.coerce.boolean()) so the schema understands either.
*/

const optionalEmail = z
  .union([z.string().email(), z.literal("")])
  .transform((s) => (s.length === 0 ? null : s));

export const boardSettingsSchema = z.object({
  name: z.string().trim().min(1, "Board name is required.").max(200),
  adminEmail: optionalEmail,
  dailySummaryEmail: optionalEmail,

  defaultSamplePercent: z.coerce
    .number()
    .int()
    .min(5, "Sample must be at least 5%.")
    .max(50, "Sample cannot exceed 50%."),

  deficiencyResponseDays: z.coerce
    .number()
    .int()
    .min(7, "Response window must be at least 7 days.")
    .max(180, "Response window cannot exceed 180 days."),

  autoFollowup30d: z.coerce.boolean(),
  autoFinal7d: z.coerce.boolean(),
  publicLookupEnabled: z.coerce.boolean(),
  dailySummaryEnabled: z.coerce.boolean(),
});

export type BoardSettingsInput = z.infer<typeof boardSettingsSchema>;

export type StoredBoardSettings = {
  defaultSamplePercent: number;
  deficiencyResponseDays: number;
  autoFollowup30d: boolean;
  autoFinal7d: boolean;
  publicLookupEnabled: boolean;
  dailySummaryEnabled: boolean;
};

export const SETTINGS_DEFAULTS: StoredBoardSettings = {
  defaultSamplePercent: 15,
  deficiencyResponseDays: 60,
  autoFollowup30d: true,
  autoFinal7d: true,
  publicLookupEnabled: true,
  dailySummaryEnabled: true,
};

/**
 * Read a board.settings JSON column into a typed shape with defaults
 * filled in for any missing keys. Safe to call on a freshly-created
 * board (settings = `{}`).
 */
export function parseStoredSettings(raw: unknown): StoredBoardSettings {
  if (!raw || typeof raw !== "object") return { ...SETTINGS_DEFAULTS };
  const obj = raw as Record<string, unknown>;
  const num = (key: keyof StoredBoardSettings, def: number): number => {
    const v = obj[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    return def;
  };
  const bool = (key: keyof StoredBoardSettings, def: boolean): boolean => {
    const v = obj[key];
    if (typeof v === "boolean") return v;
    return def;
  };
  return {
    defaultSamplePercent: num(
      "defaultSamplePercent",
      SETTINGS_DEFAULTS.defaultSamplePercent,
    ),
    deficiencyResponseDays: num(
      "deficiencyResponseDays",
      SETTINGS_DEFAULTS.deficiencyResponseDays,
    ),
    autoFollowup30d: bool("autoFollowup30d", SETTINGS_DEFAULTS.autoFollowup30d),
    autoFinal7d: bool("autoFinal7d", SETTINGS_DEFAULTS.autoFinal7d),
    publicLookupEnabled: bool(
      "publicLookupEnabled",
      SETTINGS_DEFAULTS.publicLookupEnabled,
    ),
    dailySummaryEnabled: bool(
      "dailySummaryEnabled",
      SETTINGS_DEFAULTS.dailySummaryEnabled,
    ),
  };
}
