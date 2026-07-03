import { Text } from "@react-email/components";
import { BrandEmail, CtaButton, DetailGrid, emailColors } from "./_brand";

/*
  Internal ops notification to AADB (info@dentalace.org via AADB_ADMIN_EMAIL):
  a new account was created, with who + which type. Fired once per account when
  it becomes active (email verified, or admin-created). Not sent to the signer.
*/

export type SignupNotificationProps = {
  name: string;
  email: string;
  typeLabel: string;
  detailRows: { label: string; value: string }[];
  adminUrl: string;
};

export default function SignupNotificationEmail({
  name,
  email,
  typeLabel,
  detailRows,
  adminUrl,
}: SignupNotificationProps) {
  const rows = [
    { label: "Name", value: name },
    { label: "Email", value: email },
    { label: "Type", value: typeLabel },
    ...detailRows,
  ];
  return (
    <BrandEmail
      preview={`${name} just signed up as ${typeLabel}`}
      subject="New signup"
      product="suite"
    >
      <Text
        style={{
          margin: "0 0 14px 0",
          fontSize: 14,
          lineHeight: 1.65,
          color: emailColors.textMid,
        }}
      >
        A new account was just created on DentalACE One. Details below.
      </Text>
      <DetailGrid rows={rows} />
      <CtaButton href={adminUrl} label="View in admin" />
    </BrandEmail>
  );
}

SignupNotificationEmail.subject = ({ typeLabel }: { typeLabel: string }): string =>
  `New signup: ${typeLabel}`;
