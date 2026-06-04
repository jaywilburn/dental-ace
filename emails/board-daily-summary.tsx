import { Text } from "@react-email/components";
import { BrandEmail, DetailGrid, CtaButton, emailColors } from "./_brand";

/*
  Board daily summary. Sent each morning to boards.daily_summary_email (or
  admin_email fallback) for boards with daily_summary_enabled. Aggregates the
  overnight delta.
*/

export type BoardDailySummaryProps = {
  boardName: string;
  date: string;
  resolvedYesterday: number;
  followupsSentYesterday: number;
  finalsSentYesterday: number;
  escalatedYesterday: number;
  openPending: number;
  openEscalated: number;
  boardUrl: string;
};

export default function BoardDailySummaryEmail({
  boardName,
  date,
  resolvedYesterday,
  followupsSentYesterday,
  finalsSentYesterday,
  escalatedYesterday,
  openPending,
  openEscalated,
  boardUrl,
}: BoardDailySummaryProps) {
  return (
    <BrandEmail
      product="ver"
      preview={`${boardName} — daily compliance summary`}
      subject="Daily Compliance Summary"
    >
      <Text style={{ margin: 0, fontSize: 14, color: emailColors.navy }}>
        {boardName} · {date}
      </Text>
      <Text
        style={{
          margin: "10px 0 14px 0",
          fontSize: 14,
          lineHeight: 1.65,
          color: emailColors.textMid,
        }}
      >
        Here&apos;s what changed overnight in your CE compliance queue. The
        full picture is always on the Verify dashboard.
      </Text>
      <DetailGrid
        rows={[
          {
            label: "Deficiencies resolved",
            value: String(resolvedYesterday),
          },
          {
            label: "30-day follow-ups sent",
            value: String(followupsSentYesterday),
          },
          {
            label: "Final warnings sent",
            value: String(finalsSentYesterday),
          },
          {
            label: "Newly escalated",
            value: String(escalatedYesterday),
          },
          {
            label: "Open · pending response",
            value: String(openPending),
          },
          {
            label: "Open · escalated",
            value: String(openEscalated),
          },
        ]}
      />
      <CtaButton href={boardUrl} label="Open Verify dashboard" />
      <Text
        style={{
          margin: "16px 0 0 0",
          fontSize: 12,
          lineHeight: 1.55,
          color: emailColors.textMuted,
        }}
      >
        Daily summaries are sent each morning. Adjust the recipient address or
        turn this off in board settings.
      </Text>
    </BrandEmail>
  );
}

BoardDailySummaryEmail.subject = ({
  boardName,
  date,
}: BoardDailySummaryProps) => `${boardName} — Daily Compliance Summary (${date})`;
