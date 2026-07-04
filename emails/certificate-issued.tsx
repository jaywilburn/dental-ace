import { Text } from "@react-email/components";
import { BrandEmail, DetailGrid, CtaButton, emailColors } from "./_brand";

/*
  Certificate-issued email sent to the attendee. The cert PDF is attached at
  send time by lib/email/send.ts; this template refers to it. Send-only —
  there is no in-app email preview tab.
*/

export type CertificateIssuedProps = {
  attendeeName: string;
  courseTitle: string;
  courseIdNumber: string;
  certificateId: string;
  ceHours: number;
  completedAt: string;
  verifyUrl: string;
  claimUrl: string;
};

export default function CertificateIssuedEmail({
  attendeeName,
  courseTitle,
  courseIdNumber,
  certificateId,
  ceHours,
  completedAt,
  verifyUrl,
  claimUrl,
}: CertificateIssuedProps) {
  return (
    <BrandEmail
      preview={`Your certificate for ${courseTitle}`}
      subject="Your CE Certificate"
    >
      <Text style={{ margin: 0, fontSize: 14, color: emailColors.navy }}>
        Congratulations {attendeeName},
      </Text>
      <Text
        style={{
          margin: "10px 0 14px 0",
          fontSize: 14,
          lineHeight: 1.65,
          color: emailColors.textMid,
        }}
      >
        You passed the course quiz and earned your continuing-education
        certificate. Your certificate PDF is attached to this email.
      </Text>
      <DetailGrid
        rows={[
          { label: "Course Title", value: courseTitle },
          { label: "CE Hours", value: `${ceHours.toFixed(1)} hours` },
          { label: "Completed", value: completedAt },
          { label: "Course ID", value: courseIdNumber },
          { label: "Certificate ID", value: certificateId },
        ]}
      />
      <CtaButton href={claimUrl} label="Add this certificate to ProTrack" />
      <Text
        style={{
          margin: "14px 0 0 0",
          fontSize: 13,
          lineHeight: 1.6,
          color: emailColors.textMid,
        }}
      >
        ProTrack is a free CE tracker. Use the button above to add this
        certificate to your ProTrack record; a free account is created for you if
        you do not have one yet, so you always have a board-ready summary of your
        continuing education.
      </Text>
      <CtaButton href={verifyUrl} label="View course details →" />
    </BrandEmail>
  );
}

CertificateIssuedEmail.subject = ({ courseTitle }: CertificateIssuedProps) =>
  `Your CE Certificate: ${courseTitle} · DentalACE`;
