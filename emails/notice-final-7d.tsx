import { Text } from "@react-email/components";
import { BrandEmail, DetailGrid, CtaButton, emailColors } from "./_brand";

/*
  Final warning, ~7 days before the deficiency deadline. Sent automatically
  by the daily cron.
*/

export type NoticeFinal7dProps = {
  recipientName: string;
  licenseNumber: string;
  boardName: string;
  missingHours: number;
  missingCategories: string[];
  deadlineDate: string;
  protrackUrl: string;
};

export default function NoticeFinal7dEmail({
  recipientName,
  licenseNumber,
  boardName,
  missingHours,
  missingCategories,
  deadlineDate,
  protrackUrl,
}: NoticeFinal7dProps) {
  const categoryLine =
    missingCategories.length === 0 ? "—" : missingCategories.join(", ");

  return (
    <BrandEmail
      product="ver"
      preview={`Final notice — deadline ${deadlineDate}`}
      subject="Final Warning: CE Audit Deficiency"
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
        This is a final warning regarding your CE audit deficiency with the{" "}
        {boardName}. Your response deadline is <strong>{deadlineDate}</strong>.
        After that date, this deficiency will be escalated to the board for
        administrative action.
      </Text>
      <DetailGrid
        rows={[
          { label: "License #", value: licenseNumber },
          { label: "Missing CE hours", value: missingHours.toFixed(1) },
          { label: "Missing categories", value: categoryLine },
          { label: "Final deadline", value: deadlineDate },
        ]}
      />
      <CtaButton href={protrackUrl} label="Upload certificates immediately" />
      <Text
        style={{
          margin: "16px 0 0 0",
          fontSize: 12,
          lineHeight: 1.55,
          color: emailColors.textMuted,
        }}
      >
        If you have already submitted the missing hours and believe this notice
        is in error, reply to this email so a board administrator can review
        your record before the deadline.
      </Text>
    </BrandEmail>
  );
}

NoticeFinal7dEmail.subject = ({ boardName, deadlineDate }: NoticeFinal7dProps) =>
  `Final Warning — CE Audit Deficiency due ${deadlineDate} (${boardName})`;
