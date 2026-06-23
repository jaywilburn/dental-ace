import { Text } from "@react-email/components";
import { BrandEmail, DetailGrid, CtaButton, emailColors } from "./_brand";

/*
  INITIAL deficiency notice. Sent manually by the board from the composer
  after an audit completes. Sets the licensee's response clock.
*/

export type NoticeInitialProps = {
  recipientName: string;
  licenseNumber: string;
  boardName: string;
  missingHours: number;
  missingCategories: string[];
  deadlineDate: string;
  protrackUrl: string;
};

export default function NoticeInitialEmail({
  recipientName,
  licenseNumber,
  boardName,
  missingHours,
  missingCategories,
  deadlineDate,
  protrackUrl,
}: NoticeInitialProps) {
  const categoryLine =
    missingCategories.length === 0
      ? "—"
      : missingCategories.join(", ");

  return (
    <BrandEmail
      product="ver"
      preview={`CE Audit Deficiency — ${boardName}`}
      subject="CE Audit Deficiency Notice"
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
        Your license has been selected in a continuing-education audit by
        the {boardName}. Based on the certificates currently on file, your
        record falls short of the requirements for this renewal cycle.
      </Text>
      <DetailGrid
        rows={[
          { label: "License #", value: licenseNumber },
          { label: "Missing CE hours", value: missingHours.toFixed(1) },
          { label: "Missing categories", value: categoryLine },
          { label: "Response deadline", value: deadlineDate },
        ]}
      />
      <Text
        style={{
          margin: "0 0 14px 0",
          fontSize: 14,
          lineHeight: 1.65,
          color: emailColors.textMid,
        }}
      >
        Upload the missing certificates in ProTrack before the deadline above.
        Once your record is complete, this deficiency closes automatically and
        no further action is required.
      </Text>
      <CtaButton href={protrackUrl} label="Upload certificates in ProTrack" />
      <Text
        style={{
          margin: "16px 0 0 0",
          fontSize: 12,
          lineHeight: 1.55,
          color: emailColors.textMuted,
        }}
      >
        If you believe this notice is in error or have already submitted these
        hours, reply to this email and a board administrator will follow up.
      </Text>
    </BrandEmail>
  );
}

NoticeInitialEmail.subject = ({ boardName }: NoticeInitialProps) =>
  `CE Audit Deficiency Notice — ${boardName}`;
