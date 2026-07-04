import { Text } from "@react-email/components";
import { BrandEmail, CtaButton, emailColors } from "./_brand";

/*
  One-time activation email for attendees whose historical CE certificates were
  migrated into DentalACE One. An account was pre-created for them
  (scripts/provision-legacy-accounts.ts); this "records-first" email invites them
  to set a password and sign in to see the CE history already waiting for them.
  Sent by scripts/send-legacy-invites.ts. Send-only (no in-app preview).
*/

export type LegacyActivationProps = {
  firstName: string;
  setPasswordUrl: string;
  expiryDays: number;
};

export default function LegacyActivationEmail({
  firstName,
  setPasswordUrl,
  expiryDays,
}: LegacyActivationProps) {
  return (
    <BrandEmail
      preview="Your CE certificates are now on DentalACE One"
      subject="Your CE certificates are now on DentalACE One"
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
        Your continuing-education certificates are now available on DentalACE One,
        the continuing-education platform operated by the American Association of
        Dental Boards (AADB). We created a free account for you so your CE history
        lives in one place, ready for board renewals.
      </Text>
      <Text
        style={{
          margin: "0 0 14px 0",
          fontSize: 14,
          lineHeight: 1.65,
          color: emailColors.textMid,
        }}
      >
        Set your password to sign in and view your board-ready CE record.
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

LegacyActivationEmail.subject = () =>
  "Your CE certificates are now on DentalACE One";
