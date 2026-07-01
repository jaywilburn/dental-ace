import { Text } from "@react-email/components";
import { BrandEmail, CtaButton, emailColors } from "./_brand";

/*
  Platform welcome sent after email verification to accounts that signed up as a
  CE company or AADB staff member (signup_intent COMPANY/STAFF). These users may
  never use ProTrack, so they get this instead of the ProTrack welcome. ProTrack
  is mentioned only as an included extra, not the headline. See
  app/api/auth/verify-email/route.ts for the branch.
*/

export type WelcomeDentalAceOneProps = {
  firstName: string;
  intent: "company" | "staff";
  homeUrl: string;
};

export default function WelcomeDentalAceOneEmail({
  firstName,
  intent,
  homeUrl,
}: WelcomeDentalAceOneProps) {
  const nextStep =
    intent === "staff"
      ? "Sign in to your home screen and request Reviewer or Admin access to join the AADB review team."
      : "Sign in to your home screen and request CE Company access to start submitting courses for accreditation.";

  return (
    <BrandEmail
      product="suite"
      preview="Welcome to DentalACE One"
      subject="Welcome to DentalACE One"
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
        Your DentalACE One account is confirmed and ready. {nextStep}
      </Text>
      <Text
        style={{
          margin: "0 0 14px 0",
          fontSize: 13,
          lineHeight: 1.6,
          color: emailColors.textMuted,
        }}
      >
        Your account also includes ProTrack, our personal CE tracker, if you are
        a licensee and want to track your own continuing education.
      </Text>
      <CtaButton href={homeUrl} label="Go to your home screen" />
    </BrandEmail>
  );
}

WelcomeDentalAceOneEmail.subject = () => "Welcome to DentalACE One";
