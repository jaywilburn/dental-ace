import { Section, Text } from "@react-email/components";
import { BrandEmail, DetailGrid, emailColors } from "./_brand";

/*
  Course-rejected email sent to the company. Reviewer feedback is inline.
  No attachments. Credit is NOT refunded (per PRD/SOW).
*/

export type ApplicationRejectedProps = {
  companyName: string;
  courseTitle: string;
  submittedAt: string;
  decisionAt: string;
  reviewerFeedback: string;
};

export default function ApplicationRejectedEmail({
  companyName,
  courseTitle,
  submittedAt,
  decisionAt,
  reviewerFeedback,
}: ApplicationRejectedProps) {
  return (
    <BrandEmail
      preview={`Application update: ${courseTitle}`}
      subject="Application Not Approved"
    >
      <Text style={{ margin: 0, fontSize: 14, color: emailColors.navy }}>
        Dear {companyName},
      </Text>
      <Text
        style={{
          margin: "10px 0 14px 0",
          fontSize: 14,
          lineHeight: 1.65,
          color: emailColors.textMid,
        }}
      >
        After careful review, the AADB has determined that the following course
        application does not meet our accreditation standards at this time.
      </Text>
      <DetailGrid
        rows={[
          { label: "Course Title", value: courseTitle },
          { label: "Submitted", value: submittedAt },
          { label: "Decision Date", value: decisionAt },
        ]}
      />
      <Section
        style={{
          backgroundColor: "#FEF2F2",
          borderLeft: "3px solid #DC2626",
          borderRadius: 7,
          padding: "12px 16px",
          margin: "8px 0 14px 0",
        }}
      >
        <Text
          style={{
            margin: 0,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: "#DC2626",
            marginBottom: 6,
          }}
        >
          Reviewer Feedback
        </Text>
        <Text
          style={{
            margin: 0,
            fontSize: 13,
            color: "#991b1b",
            lineHeight: 1.6,
          }}
        >
          {reviewerFeedback}
        </Text>
      </Section>
      <Text
        style={{
          margin: 0,
          fontSize: 13,
          color: emailColors.textMid,
          lineHeight: 1.65,
        }}
      >
        You may resubmit a revised application. A new application credit will be
        required. Please contact AADB if you have questions about this decision.
      </Text>
    </BrandEmail>
  );
}

ApplicationRejectedEmail.subject = ({ courseTitle }: ApplicationRejectedProps) =>
  `Application Update: ${courseTitle} · DentalACE`;
