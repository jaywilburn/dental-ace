import { Text } from "@react-email/components";
import { BrandEmail, CtaButton, emailColors } from "./_brand";

export type VerifyEmailProps = {
  firstName: string;
  verifyUrl: string;
};

export default function VerifyEmail({ firstName, verifyUrl }: VerifyEmailProps) {
  return (
    <BrandEmail
      product="suite"
      preview="Confirm your email to finish setting up your account"
      subject="Confirm your email"
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
        Welcome to DentalACE One. Confirm your email address to finish setting up
        your account and sign in. This link expires in 24 hours.
      </Text>
      <CtaButton href={verifyUrl} label="Confirm my email" />
      <Text
        style={{
          margin: "8px 0 0 0",
          fontSize: 11,
          color: emailColors.textMuted,
          lineHeight: 1.6,
        }}
      >
        If you did not create a DentalACE One account, you can ignore this email
        and no account will be activated.
      </Text>
    </BrandEmail>
  );
}
