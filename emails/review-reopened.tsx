import { Text } from "@react-email/components";
import { BrandEmail, CtaButton, emailColors } from "./_brand";

/*
  Sent to the company when a reviewer or admin reverses a rejection and puts the
  submission back in the AADB queue (lib/reviewer/reopen-actions.ts).

  The provider already received a rejection email, so letting them keep
  believing they were declined while AADB quietly re-reviews is worse than a
  short note.

  The reopen reason is a STAFF note recorded on the audit log and is
  deliberately not included here. There is also nothing for the provider to do,
  so this email asks for nothing.
*/

export type ReviewReopenedProps = {
  companyName: string;
  /** "Event: Smile Together" or a course title. */
  itemTitle: string;
  detailUrl: string;
};

export default function ReviewReopenedEmail({
  companyName,
  itemTitle,
  detailUrl,
}: ReviewReopenedProps) {
  return (
    <BrandEmail
      preview={`Back under review: ${itemTitle}`}
      subject="Back Under Review"
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
        Good news. Your submission below has been returned to the AADB review
        queue, and the earlier decision no longer stands. A reviewer is looking
        at it again.
      </Text>
      <Text
        style={{
          margin: "0 0 14px 0",
          fontSize: 14,
          lineHeight: 1.65,
          color: emailColors.navy,
          fontWeight: 600,
        }}
      >
        {itemTitle}
      </Text>
      <Text
        style={{
          margin: "0 0 4px 0",
          fontSize: 14,
          lineHeight: 1.65,
          color: emailColors.textMid,
        }}
      >
        No action is needed from you right now. We will email you again once a
        decision has been made. If you have questions in the meantime, contact
        us at info@dentalace.org.
      </Text>
      <CtaButton href={detailUrl} label="View Submission →" />
    </BrandEmail>
  );
}

ReviewReopenedEmail.subject = ({ itemTitle }: ReviewReopenedProps) =>
  `Back Under Review: ${itemTitle} · DentalACE`;
