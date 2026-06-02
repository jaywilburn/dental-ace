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
};

export default function CertificateIssuedEmail({
  attendeeName,
  courseTitle,
  courseIdNumber,
  certificateId,
  ceHours,
  completedAt,
  verifyUrl,
}: CertificateIssuedProps) {
  return (
    <BrandEmail
      preview={`Your certificate for ${courseTitle}`}
      subject="🎓 Your CE Certificate"
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
      <CtaButton href={verifyUrl} label="View course details →" />
    </BrandEmail>
  );
}

CertificateIssuedEmail.subject = ({ courseTitle }: CertificateIssuedProps) =>
  `Your CE Certificate: ${courseTitle} · DentalACE`;
