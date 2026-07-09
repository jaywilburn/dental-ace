import { Text } from "@react-email/components";
import { BrandEmail, CtaButton, DetailGrid, emailColors } from "./_brand";
import type { MarketingLeadSourceValue } from "@/lib/leads/schema";

/*
  Internal ops notification to AADB (info@dentalace.org via AADB_ADMIN_EMAIL):
  a new lead came in from a pre-launch marketing form (VerifyIQ early access or
  Verify sales inquiry). Fired best-effort when a lead is captured. Never sent to
  the lead. Mirrors emails/signup-notification.tsx.
*/

export type MarketingLeadEmailProps = {
  source: MarketingLeadSourceValue;
  contactName: string;
  title: string | null;
  organization: string;
  email: string;
  message: string | null;
  receivedAt: string;
  adminUrl: string;
};

const SOURCE_LABEL: Record<MarketingLeadSourceValue, string> = {
  VERIFYIQ: "VerifyIQ early access",
  VERIFY: "Verify (state board inquiry)",
};

export default function MarketingLeadEmail({
  source,
  contactName,
  title,
  organization,
  email,
  message,
  receivedAt,
  adminUrl,
}: MarketingLeadEmailProps) {
  const rows = [
    { label: "Source", value: SOURCE_LABEL[source] },
    { label: "Name", value: contactName },
    ...(title ? [{ label: "Title", value: title }] : []),
    { label: "Organization", value: organization },
    { label: "Email", value: email },
    { label: "Received", value: receivedAt },
  ];
  return (
    <BrandEmail
      preview={`${contactName} from ${organization} contacted you via ${SOURCE_LABEL[source]}`}
      subject="New marketing lead"
      product="ver"
    >
      <Text
        style={{
          margin: "0 0 14px 0",
          fontSize: 14,
          lineHeight: 1.65,
          color: emailColors.textMid,
        }}
      >
        A new lead just came in from the {SOURCE_LABEL[source]} form. Details below.
      </Text>
      <DetailGrid rows={rows} />
      {message ? (
        <Text
          style={{
            margin: "0 0 4px 0",
            fontSize: 12,
            fontWeight: 600,
            color: emailColors.textMuted,
          }}
        >
          Message
        </Text>
      ) : null}
      {message ? (
        <Text
          style={{
            margin: "0 0 18px 0",
            fontSize: 14,
            lineHeight: 1.65,
            color: emailColors.navy,
            whiteSpace: "pre-wrap",
          }}
        >
          {message}
        </Text>
      ) : null}
      <CtaButton href={adminUrl} label="View in admin" />
    </BrandEmail>
  );
}

MarketingLeadEmail.subject = ({ source }: { source: MarketingLeadSourceValue }): string =>
  `New ${SOURCE_LABEL[source]} lead`;
