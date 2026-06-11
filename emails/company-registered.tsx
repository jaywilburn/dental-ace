import { Text } from "@react-email/components";
import { BrandEmail, DetailGrid, CtaButton, emailColors } from "./_brand";

/*
  AADB admin notification when a CE provider self-registers an organization.
  Registration is instant access (no approval step); the company starts at
  zero credits, so the credit gate is the real barrier. This email keeps AADB
  in the loop on every new organization.
*/

export type CompanyRegisteredProps = {
  companyName: string;
  contactEmail: string;
  contactPhone?: string;
  address: string;
  registrantName: string;
  registrantEmail: string;
  registeredAt: string;
  adminUrl: string;
};

export default function CompanyRegisteredEmail({
  companyName,
  contactEmail,
  contactPhone,
  address,
  registrantName,
  registrantEmail,
  registeredAt,
  adminUrl,
}: CompanyRegisteredProps) {
  return (
    <BrandEmail
      preview={`New organization registered: ${companyName}`}
      subject="New Organization Registered"
    >
      <Text
        style={{
          margin: "0 0 14px 0",
          fontSize: 14,
          lineHeight: 1.65,
          color: emailColors.textMid,
        }}
      >
        A new CE provider organization just registered with DentalACE. No
        action is required: the account starts with zero credits and cannot
        submit applications until credits are purchased.
      </Text>
      <DetailGrid
        rows={[
          { label: "Organization", value: companyName },
          { label: "Contact Email", value: contactEmail },
          ...(contactPhone
            ? [{ label: "Contact Phone", value: contactPhone }]
            : []),
          { label: "Address", value: address },
          { label: "Registered By", value: `${registrantName} (${registrantEmail})` },
          { label: "Registered At", value: registeredAt },
        ]}
      />
      <CtaButton href={adminUrl} label="View in Admin →" />
    </BrandEmail>
  );
}

CompanyRegisteredEmail.subject = ({ companyName }: CompanyRegisteredProps) =>
  `New organization registered: ${companyName}`;
