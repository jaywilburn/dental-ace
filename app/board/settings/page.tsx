import { PageHeader } from "@/components/portal-shell";
import { requireBoard } from "@/lib/board/scope";
import { updateBoardSettings } from "@/lib/board/settings/update";
import { parseStoredSettings } from "@/lib/board/settings/schema";
import { stateName } from "@/lib/protrack/reference";

/*
  /board/settings — editor for the board's identity + the cron toggles the
  daily handlers consume.

  Saved values flow into:
   - board.name / board.adminEmail / board.dailySummaryEmail (columns)
   - board.settings JSON, read by:
        verify-deficiency-check  — autoFollowup30d, autoFinal7d
        verify-board-summary     — dailySummaryEnabled
        notice composer          — deficiencyResponseDays (default deadline)
        audit form               — defaultSamplePercent (default sample)
        public /verify lookup    — publicLookupEnabled (per-board opt-out)
*/

const fieldClass =
  "w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] text-navy outline-none focus:border-ver";
const labelClass = "mb-1 block text-[11px] font-semibold text-text-mid";

export default async function BoardSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { board } = await requireBoard();
  const settings = parseStoredSettings(board.settings);
  const { saved, error } = await searchParams;

  return (
    <>
      <PageHeader
        title="Board settings"
        subtitle={`${stateName(board.state)} · audit defaults, notice timing, automation toggles.`}
      />

      {saved ? (
        <div className="mb-4 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-[12px] text-green-800">
          Saved. Cron handlers pick up the new values on their next run.
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800">
          {error}
        </div>
      ) : null}

      <form action={updateBoardSettings} className="space-y-5">
        {/* Identity */}
        <section className="overflow-hidden rounded-lg border border-border bg-white">
          <header className="border-b border-border bg-surface px-4 py-2">
            <h2 className="font-serif text-sm font-semibold text-navy">
              Board identity
            </h2>
            <p className="mt-0.5 text-[11px] text-text-muted">
              Shown on outbound notices and the public /verify lookup.
            </p>
          </header>
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="name" className={labelClass}>
                Board name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                maxLength={200}
                defaultValue={board.name}
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor="adminEmail" className={labelClass}>
                Admin email
              </label>
              <input
                id="adminEmail"
                name="adminEmail"
                type="email"
                defaultValue={board.adminEmail ?? ""}
                placeholder="board-admin@texas.gov"
                className={fieldClass}
              />
              <p className="mt-1 text-[10px] text-text-muted">
                Fallback recipient for the daily summary if no dedicated
                address is set.
              </p>
            </div>
            <div>
              <label htmlFor="dailySummaryEmail" className={labelClass}>
                Daily summary email
              </label>
              <input
                id="dailySummaryEmail"
                name="dailySummaryEmail"
                type="email"
                defaultValue={board.dailySummaryEmail ?? ""}
                placeholder="compliance@texas.gov"
                className={fieldClass}
              />
              <p className="mt-1 text-[10px] text-text-muted">
                Where the daily compliance digest is sent.
              </p>
            </div>
            <div className="sm:col-span-2 rounded-md border border-dashed border-border bg-surface px-3 py-2 text-[11px] text-text-muted">
              State:{" "}
              <span className="font-semibold text-navy">
                {stateName(board.state)} ({board.state})
              </span>{" "}
              · locked. Contact AADB to migrate.
            </div>
          </div>
        </section>

        {/* Audit + notice defaults */}
        <section className="overflow-hidden rounded-lg border border-border bg-white">
          <header className="border-b border-border bg-surface px-4 py-2">
            <h2 className="font-serif text-sm font-semibold text-navy">
              Audit & notice defaults
            </h2>
            <p className="mt-0.5 text-[11px] text-text-muted">
              Pre-fill values for the audit form and the notice composer. You
              can always override per run.
            </p>
          </header>
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <div>
              <label htmlFor="defaultSamplePercent" className={labelClass}>
                Default sample size (%)
              </label>
              <input
                id="defaultSamplePercent"
                name="defaultSamplePercent"
                type="number"
                min={5}
                max={50}
                step={1}
                required
                defaultValue={settings.defaultSamplePercent}
                className={fieldClass}
              />
              <p className="mt-1 text-[10px] text-text-muted">
                Pre-selected on the &ldquo;Run audit&rdquo; form (5–50%).
              </p>
            </div>
            <div>
              <label htmlFor="deficiencyResponseDays" className={labelClass}>
                Deficiency response window (days)
              </label>
              <input
                id="deficiencyResponseDays"
                name="deficiencyResponseDays"
                type="number"
                min={7}
                max={180}
                step={1}
                required
                defaultValue={settings.deficiencyResponseDays}
                className={fieldClass}
              />
              <p className="mt-1 text-[10px] text-text-muted">
                Used to pre-fill the deadline date on the initial notice
                composer (7–180 days).
              </p>
            </div>
          </div>
        </section>

        {/* Automation toggles */}
        <section className="overflow-hidden rounded-lg border border-border bg-white">
          <header className="border-b border-border bg-surface px-4 py-2">
            <h2 className="font-serif text-sm font-semibold text-navy">
              Automation
            </h2>
            <p className="mt-0.5 text-[11px] text-text-muted">
              Toggle the nightly behaviors. Turning a toggle off pauses that
              cron pass for this board only.
            </p>
          </header>
          <div className="divide-y divide-border">
            <SettingToggle
              name="autoFollowup30d"
              label="Send 30-day follow-up notices automatically"
              hint="When a deficiency has been open 30+ days and no follow-up has been sent."
              defaultChecked={settings.autoFollowup30d}
            />
            <SettingToggle
              name="autoFinal7d"
              label="Send 7-day final warnings automatically"
              hint="Sent when the deadline is within the next 7 days."
              defaultChecked={settings.autoFinal7d}
            />
            <SettingToggle
              name="dailySummaryEnabled"
              label="Email me a daily compliance digest"
              hint="Yesterday's resolved / sent / escalated counts + currently open totals. Skips silent days."
              defaultChecked={settings.dailySummaryEnabled}
            />
            <SettingToggle
              name="publicLookupEnabled"
              label="Show this board's records on the public /verify lookup"
              hint="Public certificate lookup uses verified-only records and never reveals license numbers from name searches."
              defaultChecked={settings.publicLookupEnabled}
            />
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-md bg-ver px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-ver/90"
          >
            Save settings
          </button>
        </div>
      </form>
    </>
  );
}

function SettingToggle({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
}) {
  return (
    <label
      htmlFor={name}
      className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-surface/60"
    >
      <input
        id={name}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 cursor-pointer accent-ver"
      />
      <span className="flex-1">
        <span className="block text-[12px] font-semibold text-navy">
          {label}
        </span>
        <span className="mt-0.5 block text-[11px] text-text-muted">{hint}</span>
      </span>
    </label>
  );
}
