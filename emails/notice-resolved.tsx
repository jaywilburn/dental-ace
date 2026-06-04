import { Text } from "@react-email/components";
import { BrandEmail, DetailGrid, emailColors } from "./_brand";

/*
  Auto-confirmation when a deficiency closes. Sent by the daily cron once a
  licensee's uploaded certificates clear the requirement.
*/

export type NoticeResolvedProps = {
  recipientName: string;
  licenseNumber: string;
  boardName: string;
  resolvedDate: string;
};

export default function NoticeResolvedEmail({
  recipientName,
  licenseNumber,
  boardName,
  resolvedDate,
}: NoticeResolvedProps) {
  return (
    <BrandEmail
      product="ver"
      preview="CE audit deficiency resolved"
      subject="✅ CE Audit Deficiency Resolved"
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
        Good news: the certificates you uploaded satisfy the CE requirements
        flagged in the {boardName}&apos;s recent audit. Your deficiency is now
        closed and no further action is required.
      </Text>
      <DetailGrid
        rows={[
          { label: "License #", value: licenseNumber },
          { label: "Resolved on", value: resolvedDate },
        ]}
      />
      <Text
        style={{
          margin: "16px 0 0 0",
          fontSize: 12,
          lineHeight: 1.55,
          color: emailColors.textMuted,
        }}
      >
        Continue using ProTrack to keep your CE record current. The board will
        not contact you again about this audit.
      </Text>
    </BrandEmail>
  );
}

NoticeResolvedEmail.subject = ({ boardName }: NoticeResolvedProps) =>
  `Resolved: CE Audit Deficiency — ${boardName}`;
