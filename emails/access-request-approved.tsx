import { Text } from "@react-email/components";
import { BrandEmail, CtaButton, emailColors } from "./_brand";

export type AccessRequestApprovedProps = {
  firstName: string;
  roleLabel: string;
  areaUrl: string;
};

export default function AccessRequestApprovedEmail({
  firstName,
  roleLabel,
  areaUrl,
}: AccessRequestApprovedProps) {
  return (
    <BrandEmail
      preview={`Your ${roleLabel} access is approved`}
      subject="Access approved"
    >
      <Text
        style={{
          margin: "0 0 14px 0",
          fontSize: 14,
          lineHeight: 1.65,
          color: emailColors.textMid,
        }}
      >
        Good news, {firstName}. Your {roleLabel} access on DentalACE One has been approved. Sign in
        and you will land in your new area.
      </Text>
      <CtaButton href={areaUrl} label="Sign in" />
    </BrandEmail>
  );
}

AccessRequestApprovedEmail.subject = ({ roleLabel }: AccessRequestApprovedProps): string =>
  `Your ${roleLabel} access is approved`;
