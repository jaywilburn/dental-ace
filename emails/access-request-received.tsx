import { Text } from "@react-email/components";
import { BrandEmail, emailColors } from "./_brand";

export type AccessRequestReceivedProps = { firstName: string; roleLabel: string };

export default function AccessRequestReceivedEmail({
  firstName,
  roleLabel,
}: AccessRequestReceivedProps) {
  return (
    <BrandEmail
      preview={`We received your ${roleLabel} access request`}
      subject="Access request received"
    >
      <Text
        style={{
          margin: "0 0 14px 0",
          fontSize: 14,
          lineHeight: 1.65,
          color: emailColors.textMid,
        }}
      >
        Hi {firstName}, we received your request for {roleLabel} access on DentalACE One. An AADB
        administrator will review it shortly. You can keep using ProTrack in the meantime, and we
        will email you as soon as your access is approved.
      </Text>
    </BrandEmail>
  );
}

AccessRequestReceivedEmail.subject = ({ roleLabel }: AccessRequestReceivedProps): string =>
  `We received your ${roleLabel} access request`;
