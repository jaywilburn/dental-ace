import { Text } from "@react-email/components";
import { BrandEmail, DetailGrid, CtaButton, emailColors } from "./_brand";

export type ProtrackWelcomeProps = {
  firstName: string;
  state: string;
  licenseType: string;
  dashboardUrl: string;
};

export default function ProtrackWelcomeEmail({
  firstName,
  state,
  licenseType,
  dashboardUrl,
}: ProtrackWelcomeProps) {
  return (
    <BrandEmail
      product="pro"
      preview="Welcome to ProTrack"
      subject="Welcome to ProTrack"
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
        Your ProTrack account is ready. We will track your continuing education
        against your state requirements, and DentalACE certificates show up here
        automatically.
      </Text>
      <DetailGrid
        rows={[
          { label: "State", value: state },
          { label: "License Type", value: licenseType },
          { label: "Plan", value: "Free" },
        ]}
      />
      <CtaButton href={dashboardUrl} label="Open your CE dashboard" />
    </BrandEmail>
  );
}
