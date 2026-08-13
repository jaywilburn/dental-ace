import { Text } from "@react-email/components";
import { BrandEmail, CtaButton, emailColors } from "./_brand";

export type ResetPasswordProps = {
  firstName: string;
  resetUrl: string;
};

export default function ResetPasswordEmail({ firstName, resetUrl }: ResetPasswordProps) {
  return (
    <BrandEmail
      product="suite"
      preview="Reset your DentalACE One password"
      subject="Reset your password"
    >
      <Text style={{ margin: 0, fontSize: 14, color: emailColors.navy }}>
        Hi {firstName},
      </Text>
      <Text
        style={{
          margin: "10px 0 14px 0",
          fontSize: 14,
          lineHeight: 1.65,
          color: emailColors.textMid,
        }}
      >
        We received a request to reset the password for your DentalACE One
        account. Choose a new password using the button below. This link expires
        in one hour.
      </Text>
      <CtaButton href={resetUrl} label="Reset my password" />
      <Text
        style={{
          margin: "8px 0 0 0",
          fontSize: 11,
          color: emailColors.textMuted,
          lineHeight: 1.6,
        }}
      >
        If you did not request a password reset, you can ignore this email and
        your password will not change.
      </Text>
    </BrandEmail>
  );
}

ResetPasswordEmail.subject = () => "Reset your password";
