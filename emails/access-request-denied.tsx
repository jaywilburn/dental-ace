import { Text } from "@react-email/components";
import { BrandEmail, emailColors } from "./_brand";

export type AccessRequestDeniedProps = {
  firstName: string;
  roleLabel: string;
  reason: string;
};

export default function AccessRequestDeniedEmail({
  firstName,
  roleLabel,
  reason,
}: AccessRequestDeniedProps) {
  return (
    <BrandEmail
      preview={`Update on your ${roleLabel} access request`}
      subject="Access request update"
    >
      <Text
        style={{
          margin: "0 0 14px 0",
          fontSize: 14,
          lineHeight: 1.65,
          color: emailColors.textMid,
        }}
      >
        Hi {firstName}, we were unable to approve your {roleLabel} access request at this time.
        Reason: {reason}. If you believe this is a mistake, contact info@dentalace.org or submit a
        new request with more detail.
      </Text>
    </BrandEmail>
  );
}

AccessRequestDeniedEmail.subject = ({ roleLabel }: AccessRequestDeniedProps): string =>
  `Update on your ${roleLabel} access request`;
