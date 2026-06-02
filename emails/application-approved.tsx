import { Section, Text } from "@react-email/components";
import { BrandEmail, DetailGrid, CtaButton, emailColors } from "./_brand";

/*
  Course-approved email sent to the company. Approval letter PDF + QR PNG
  are attached at send time by lib/email/send.ts; this template just refers
  to them.
*/

export type ApplicationApprovedProps = {
  companyName: string;
  courseTitle: string;
  courseIdNumber: string;
  ceHours: number;
  approvedAt: string;
  expiresAt: string;
  myCoursesUrl: string;
};

export default function ApplicationApprovedEmail({
  companyName,
  courseTitle,
  courseIdNumber,
  ceHours,
  approvedAt,
  expiresAt,
  myCoursesUrl,
}: ApplicationApprovedProps) {
  return (
    <BrandEmail
      preview={`Approved: ${courseTitle}`}
      subject="✅ Course Accreditation Approved"
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
        Congratulations: your course application has been reviewed and approved by
        the American Association of Dental Boards.
      </Text>
      <DetailGrid
        rows={[
          { label: "Course Title", value: courseTitle },
          { label: "Course ID", value: courseIdNumber },
          { label: "CE Hours", value: `${ceHours.toFixed(1)} hours` },
          { label: "Approval Date", value: approvedAt },
          { label: "Expiration Date", value: expiresAt },
        ]}
      />
      <Section
        style={{
          backgroundColor: emailColors.surface,
          border: `1px solid ${emailColors.border}`,
          borderRadius: 8,
          padding: "14px 16px",
          margin: "8px 0 18px 0",
        }}
      >
        <Text
          style={{
            margin: 0,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: emailColors.textMuted,
            marginBottom: 8,
          }}
        >
          Attached to this email
        </Text>
        <Text
          style={{
            margin: "0 0 6px 0",
            fontSize: 13,
            color: emailColors.textMid,
            lineHeight: 1.6,
          }}
        >
          📄 <strong>Letter of Accreditation</strong> — Official AADB approval letter (PDF).
        </Text>
        <Text style={{ margin: 0, fontSize: 13, color: emailColors.textMid, lineHeight: 1.6 }}>
          ⬛ <strong>Attendee QR Code</strong> — Display at events or embed in course
          materials so attendees can claim their certificate (PNG).
        </Text>
        <Text
          style={{
            margin: "12px 0 8px 0",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: emailColors.textMuted,
          }}
        >
          Available in your portal
        </Text>
        <Text
          style={{
            margin: 0,
            fontSize: 13,
            color: emailColors.textMid,
            lineHeight: 1.6,
          }}
        >
          🏅 <strong>ACE Marketing Badge</strong> — Coming soon. The official AADB
          accreditation badge stamped with your Course ID and approval date. Use it
          across course marketing materials, emails, and websites.
        </Text>
      </Section>
      <CtaButton href={myCoursesUrl} label="Go to My Courses →" />
    </BrandEmail>
  );
}

ApplicationApprovedEmail.subject = ({ courseTitle }: ApplicationApprovedProps) =>
  `Approved: ${courseTitle} · DentalACE`;
