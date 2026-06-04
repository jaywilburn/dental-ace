import { Text } from "@react-email/components";
import { BrandEmail, DetailGrid, CtaButton, emailColors } from "./_brand";

/*
  Low-cert-balance alert, sent to the company when cert_balance falls to or
  below cert_alert_threshold. Rolling 7-day cooldown enforced by the cron.
*/

export type LowCertBalanceProps = {
  companyName: string;
  certBalance: number;
  threshold: number;
  buyCertsUrl: string;
};

export default function LowCertBalanceEmail({
  companyName,
  certBalance,
  threshold,
  buyCertsUrl,
}: LowCertBalanceProps) {
  return (
    <BrandEmail
      preview={`Certificate balance low (${certBalance} left)`}
      subject="Certificate balance running low"
    >
      <Text style={{ margin: 0, fontSize: 14, color: emailColors.navy }}>
        Dear {companyName},
      </Text>
      <Text style={{ margin: "10px 0 14px 0", fontSize: 14, lineHeight: 1.65, color: emailColors.textMid }}>
        Your certificate balance is running low. When it reaches zero, attendees
        cannot claim certificates for your courses. Top up to avoid interruption.
      </Text>
      <DetailGrid
        rows={[
          { label: "Certificates Remaining", value: String(certBalance) },
          { label: "Alert Threshold", value: String(threshold) },
        ]}
      />
      <CtaButton href={buyCertsUrl} label="Buy Certificates →" />
    </BrandEmail>
  );
}

LowCertBalanceEmail.subject = ({ certBalance }: LowCertBalanceProps) =>
  `Certificate balance low (${certBalance} left) · DentalACE`;
