import { Text } from "@react-email/components";
import { BrandEmail, CtaButton, emailColors } from "./_brand";

/*
  One-time activation email for CE-provider (company) accounts created from the
  legacy migration. An owner account was pre-created and linked to the pre-loaded
  Company (scripts/provision-legacy-providers.ts); this email invites the owner to
  set a password and sign in to run the account that already has their accredited
  courses and issued-certificate history. Sent by
  scripts/send-legacy-provider-invites.ts. Send-only (no in-app preview).
*/

export type LegacyProviderActivationProps = {
  firstName: string;
  companyName: string;
  setPasswordUrl: string;
  expiryDays: number;
};

export default function LegacyProviderActivationEmail({
  firstName,
  companyName,
  setPasswordUrl,
  expiryDays,
}: LegacyProviderActivationProps) {
  return (
    <BrandEmail
      preview="Your DentalACE One provider account is ready"
      subject="Your DentalACE One provider account is ready"
      product="suite"
    >
      <Text style={{ margin: 0, fontSize: 14, color: emailColors.navy }}>
        Hello {firstName},
      </Text>
      <Text
        style={{
          margin: "10px 0 14px 0",
          fontSize: 14,
          lineHeight: 1.65,
          color: emailColors.textMid,
        }}
      >
        Your CE-provider account for {companyName} is now on DentalACE One, the
        continuing-education platform operated by the American Association of Dental
        Boards (AADB). Your accredited courses and issued-certificate history have
        carried over, so everything is ready the moment you sign in.
      </Text>
      <Text
        style={{
          margin: "0 0 14px 0",
          fontSize: 14,
          lineHeight: 1.65,
          color: emailColors.textMid,
        }}
      >
        Set a password to sign in and manage your courses, issue attendee
        certificates, purchase certificate bundles, and view your provider dashboard.
      </Text>
      <CtaButton href={setPasswordUrl} label="Set your password →" />
      <Text
        style={{
          margin: "14px 0 0 0",
          fontSize: 13,
          lineHeight: 1.6,
          color: emailColors.textMid,
        }}
      >
        This link is valid for {expiryDays} days. If it expires, you can request a
        new one from the sign-in page. If you did not expect this email, you can
        safely ignore it.
      </Text>
    </BrandEmail>
  );
}

LegacyProviderActivationEmail.subject = () =>
  "Your DentalACE One provider account is ready";
