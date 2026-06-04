import { Text } from "@react-email/components";
import { BrandEmail, CtaButton, emailColors } from "./_brand";

export type StaffInviteProps = {
  firstName: string;
  roleLabel: string;
  setPasswordUrl: string;
};

export default function StaffInviteEmail({ firstName, roleLabel, setPasswordUrl }: StaffInviteProps) {
  return (
    <BrandEmail preview="Set up your DentalACE staff account" subject="Your DentalACE staff account" product="suite">
      <Text style={{ margin: 0, fontSize: 14, color: emailColors.navy }}>Hello {firstName},</Text>
      <Text style={{ margin: "10px 0 14px 0", fontSize: 14, lineHeight: 1.65, color: emailColors.textMid }}>
        An administrator created a DentalACE {roleLabel} account for you. Set your password to sign in. This link
        expires in 24 hours.
      </Text>
      <CtaButton href={setPasswordUrl} label="Set your password →" />
    </BrandEmail>
  );
}

StaffInviteEmail.subject = () => "Your DentalACE staff account · Set your password";
