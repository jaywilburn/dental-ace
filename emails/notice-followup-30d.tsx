import { Text } from "@react-email/components";
import { BrandEmail, DetailGrid, CtaButton, emailColors } from "./_brand";

/*
  30-day follow-up. Sent automatically by the daily cron when an INITIAL
  notice was sent 30 days ago and the deficiency is still PENDING.
*/

export type NoticeFollowup30dProps = {
  recipientName: string;
  licenseNumber: string;
  boardName: string;
  missingHours: number;
  missingCategories: string[];
  deadlineDate: string;
  daysRemaining: number;
  protrackUrl: string;
};

export default function NoticeFollowup30dEmail({
  recipientName,
  licenseNumber,
  boardName,
  missingHours,
  missingCategories,
  deadlineDate,
  daysRemaining,
  protrackUrl,
}: NoticeFollowup30dProps) {
  const categoryLine =
    missingCategories.length === 0 ? "—" : missingCategories.join(", ");

  return (
    <BrandEmail
      product="ver"
      preview={`Reminder: CE Audit Deficiency — ${daysRemaining} days remaining`}
      subject="Reminder: CE Audit Deficiency"
    >
      <Text style={{ margin: 0, fontSize: 14, color: emailColors.navy }}>
        Dear {recipientName},
      </Text>
      <Text
        style={{
          margin: "10px 0 14px 0",
          fontSize: 14,
          lineHeight: 1.65,
          color: emailColors.textMid,
        }}
      >
        Thirty days ago, the {boardName} notified you of a CE audit deficiency
        on your license. Our records still show the same shortfall. You have
        approximately <strong>{daysRemaining} days</strong> remaining to upload
        the missing certificates.
      </Text>
      <DetailGrid
        rows={[
          { label: "License #", value: licenseNumber },
          { label: "Missing CE hours", value: missingHours.toFixed(1) },
          { label: "Missing categories", value: categoryLine },
          { label: "Response deadline", value: deadlineDate },
        ]}
      />
      <CtaButton href={protrackUrl} label="Upload certificates now" />
      <Text
        style={{
          margin: "16px 0 0 0",
          fontSize: 12,
          lineHeight: 1.55,
          color: emailColors.textMuted,
        }}
      >
        After the deadline, unresolved deficiencies are escalated to the board
        for administrative review.
      </Text>
    </BrandEmail>
  );
}

NoticeFollowup30dEmail.subject = ({ boardName, daysRemaining }: NoticeFollowup30dProps) =>
  `Reminder: CE Audit Deficiency (${daysRemaining} days left) — ${boardName}`;
