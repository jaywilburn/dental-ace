import { Section, Text } from "@react-email/components";
import { BrandEmail, CtaButton, DetailGrid, emailColors } from "./_brand";

/*
  Rejection email sent to the company, for BOTH course applications and events
  (rejectEvent reuses this template with an "Event: <name>" title).

  No attachments. The original credit is not refunded, and NO new credit is
  charged to revise and resubmit (client decision 2026-07-29, reversing the
  PRD/SOW line this copy used to state). The gate is creditChargedAt on
  Event / CourseApplication; see lib/company/resubmit-actions.ts.

  revisionUrl is required: this template previously had no call to action at
  all, so a provider was told to resubmit with no way to reach the thing.
*/

export type ApplicationRejectedProps = {
  companyName: string;
  courseTitle: string;
  submittedAt: string;
  decisionAt: string;
  reviewerFeedback: string;
  /** Deep link to the rejected item, where the Revise button lives. */
  revisionUrl: string;
};

export default function ApplicationRejectedEmail({
  companyName,
  courseTitle,
  submittedAt,
  decisionAt,
  reviewerFeedback,
  revisionUrl,
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
        You can revise and resubmit this at no additional cost. Your original
        application credit still covers it, so no new credit is required. Open
        it below to read the full reviewer feedback and start your revision.
      </Text>
      <CtaButton href={revisionUrl} label="Revise and Resubmit →" />
      <Text
        style={{
          margin: 0,
          fontSize: 13,
          color: emailColors.textMid,
          lineHeight: 1.65,
        }}
      >
        If you have questions about this decision, contact us at
        info@dentalace.org.
      </Text>
    </BrandEmail>
  );
}

ApplicationRejectedEmail.subject = ({ courseTitle }: ApplicationRejectedProps) =>
  `Application Update: ${courseTitle} · DentalACE`;
