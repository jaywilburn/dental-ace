import { Text } from "@react-email/components";
import { BrandEmail, CtaButton, emailColors } from "./_brand";

export type AccessRequestNewAdminProps = {
  roleLabel: string;
  requestLabel: string;
  requesterName: string;
  requesterEmail: string;
  queueUrl: string;
};

export default function AccessRequestNewAdminEmail({
  roleLabel,
  requestLabel,
  requesterName,
  requesterEmail,
  queueUrl,
}: AccessRequestNewAdminProps) {
  return (
    <BrandEmail
      preview={`New ${roleLabel} access request`}
      subject="New access request"
    >
      <Text
        style={{
          margin: "0 0 14px 0",
          fontSize: 14,
          lineHeight: 1.65,
          color: emailColors.textMid,
        }}
      >
        {requesterName} ({requesterEmail}) requested {roleLabel} access: {requestLabel}. Review it
        in the access-request queue.
      </Text>
      <CtaButton href={queueUrl} label="Open the queue" />
    </BrandEmail>
  );
}

AccessRequestNewAdminEmail.subject = ({ roleLabel }: AccessRequestNewAdminProps): string =>
  `New ${roleLabel} access request`;
