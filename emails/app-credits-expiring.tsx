import { Text } from "@react-email/components";
import { BrandEmail, DetailGrid, CtaButton, emailColors } from "./_brand";

/*
  App-credits-expiring reminder, sent to the company ~30 days before unused
  application credits expire. Send-only.
*/

export type AppCreditsExpiringProps = {
  companyName: string;
  creditsRemaining: number;
  expiresAt: string;
  buyCreditsUrl: string;
};

export default function AppCreditsExpiringEmail({
  companyName,
  creditsRemaining,
  expiresAt,
  buyCreditsUrl,
}: AppCreditsExpiringProps) {
  return (
    <BrandEmail
      preview={`${creditsRemaining} application credits expiring soon`}
      subject="Application credits expiring"
    >
      <Text style={{ margin: 0, fontSize: 14, color: emailColors.navy }}>
        Dear {companyName},
      </Text>
      <Text style={{ margin: "10px 0 14px 0", fontSize: 14, lineHeight: 1.65, color: emailColors.textMid }}>
        Some of your application credits will expire soon. Use them to submit a
        course application before they lapse.
      </Text>
      <DetailGrid
        rows={[
          { label: "Credits Remaining", value: String(creditsRemaining) },
          { label: "Expire On", value: expiresAt },
        ]}
      />
      <CtaButton href={buyCreditsUrl} label="Manage Credits →" />
    </BrandEmail>
  );
}

AppCreditsExpiringEmail.subject = ({ creditsRemaining }: AppCreditsExpiringProps) =>
  `${creditsRemaining} application credits expiring soon · DentalACE`;
