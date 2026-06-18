import { Text } from "@react-email/components";
import { BrandEmail, DetailGrid, CtaButton, emailColors } from "./_brand";

/*
  Reviewer notification + customer confirmation when an application is submitted.
  Same template; recipient list determines who sees it.

  - Reviewers see "A new course application has been submitted..."
  - Customer (cc'd) sees the same details as their confirmation receipt.
*/

export type ApplicationSubmittedProps = {
  recipientName: string;
  companyName: string;
  courseTitle: string;
  ceHours: number;
  deliveryFormat: string;
  submittedAt: string;
  reviewUrl: string;
};

export default function ApplicationSubmittedEmail({
  recipientName,
  companyName,
  courseTitle,
  ceHours,
  deliveryFormat,
  submittedAt,
  reviewUrl,
}: ApplicationSubmittedProps) {
  return (
    <BrandEmail
      preview={`New application: ${courseTitle}`}
      subject="New Application Submitted"
    >
      <Text style={{ margin: 0, fontSize: 14, color: emailColors.navy }}>
        {recipientName},
      </Text>
      <Text
        style={{
          margin: "10px 0 14px 0",
          fontSize: 14,
          lineHeight: 1.65,
          color: emailColors.textMid,
        }}
      >
        A new course application has been submitted and is ready for review.
      </Text>
      <DetailGrid
        rows={[
          { label: "Company", value: companyName },
          { label: "Course", value: courseTitle },
          { label: "CE Hours", value: `${ceHours.toFixed(1)} hours · ${deliveryFormat}` },
          { label: "Submitted", value: submittedAt },
        ]}
      />
      <CtaButton href={reviewUrl} label="Review Application →" />
      <Text
        style={{
          margin: 0,
          fontSize: 12,
          color: emailColors.textMuted,
          lineHeight: 1.6,
        }}
      >
        Reviews complete within about 10 business days.
      </Text>
    </BrandEmail>
  );
}

ApplicationSubmittedEmail.subject = ({ courseTitle }: ApplicationSubmittedProps) =>
  `New Application: ${courseTitle}`;
