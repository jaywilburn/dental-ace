import { Text } from "@react-email/components";
import { BrandEmail, CtaButton, emailColors } from "./_brand";

/*
  Cert-balance-exhausted alert, sent to the company AND AADB_ADMIN_EMAIL when
  cert_balance hits zero. Rolling 7-day cooldown enforced by the cron.
*/

export type CertBalanceExhaustedProps = {
  companyName: string;
  buyCertsUrl: string;
};

export default function CertBalanceExhaustedEmail({
  companyName,
  buyCertsUrl,
}: CertBalanceExhaustedProps) {
  return (
    <BrandEmail
      preview="Certificate balance depleted"
      subject="Certificate balance depleted"
    >
      <Text style={{ margin: 0, fontSize: 14, color: emailColors.navy }}>
        Dear {companyName},
      </Text>
      <Text style={{ margin: "10px 0 14px 0", fontSize: 14, lineHeight: 1.65, color: emailColors.textMid }}>
        Your certificate balance has reached zero. Attendees can no longer claim
        certificates for your accredited courses until you add more. Purchase a
        certificate bundle to resume issuing right away.
      </Text>
      <CtaButton href={buyCertsUrl} label="Buy Certificates →" />
    </BrandEmail>
  );
}

CertBalanceExhaustedEmail.subject = ({ companyName }: CertBalanceExhaustedProps) =>
  `Certificate balance depleted for ${companyName} · DentalACE`;
