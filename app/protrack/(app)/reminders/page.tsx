import { PageHeader } from "@/components/portal-shell";
import { requireProtrackPro } from "@/lib/protrack/require-pro";
import { prisma } from "@/lib/prisma";
import {
  parseReminderSettings,
  REMINDER_LABELS,
  RENEWAL_THRESHOLDS,
  type ReminderKey,
} from "@/lib/protrack/reminders";
import { saveReminderSettings } from "@/lib/protrack/reminder-actions";

/*
  Pro-gated reminder preferences. requireProtrackPro redirects FREE licensees to
  the upgrade page. Mirrors logic/protrack-dev-mockup-suite.html #reminders.
*/
export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireProtrackPro();
  const { saved } = await searchParams;

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { reminderSettings: true },
  });
  const settings = parseReminderSettings(record?.reminderSettings);

  return (
    <>
      <PageHeader
        title="Renewal Reminders"
        subtitle="Automated email alerts so you never miss a deadline."
      />

      {saved ? (
        <p className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-[12px] text-green-700">
          Reminder preferences saved.
        </p>
      ) : null}

      <form
        action={saveReminderSettings}
        className="max-w-2xl space-y-5 rounded-lg border border-border bg-white p-5"
      >
        <fieldset>
          <legend className="text-[12px] font-semibold text-navy">
            Renewal deadline reminders
          </legend>
          <p className="mb-3 text-[11px] text-text-muted">
            We email you as your renewal date approaches.
          </p>
          <div className="divide-y divide-border">
            {RENEWAL_THRESHOLDS.map((t) => (
              <ToggleRow
                key={t.key}
                name={t.key}
                label={REMINDER_LABELS[t.key]}
                defaultChecked={settings[t.key]}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="border-t border-border pt-4">
          <legend className="text-[12px] font-semibold text-navy">
            Category gap alerts
          </legend>
          <p className="mb-3 text-[11px] text-text-muted">
            We flag required CE categories you have not completed as your deadline
            nears.
          </p>
          <div className="divide-y divide-border">
            <ToggleRow
              name="categoryGap"
              label={REMINDER_LABELS.categoryGap}
              defaultChecked={settings.categoryGap}
            />
          </div>
        </fieldset>

        <button
          type="submit"
          className="rounded-md bg-navy px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-navy/90"
        >
          Save preferences
        </button>
      </form>
    </>
  );
}

function ToggleRow({
  name,
  label,
  defaultChecked,
}: {
  name: ReminderKey;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between py-2.5">
      <span className="text-[12px] text-navy">{label}</span>
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-4 accent-ace"
      />
    </label>
  );
}
