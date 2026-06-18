import { Text } from "@react-email/components";
import { BrandEmail, DetailGrid, CtaButton, emailColors } from "./_brand";

/*
  Course-expiring reminder sent to the company at 60 and 30 days before an
  accredited course's expiry. Send-only; no in-app preview tab.
*/

export type CourseExpiringProps = {
  companyName: string;
  courseTitle: string;
  courseIdNumber: string;
  expiresAt: string;
  daysRemaining: number;
  myCoursesUrl: string;
};

export default function CourseExpiringEmail({
  companyName,
  courseTitle,
  courseIdNumber,
  expiresAt,
  daysRemaining,
  myCoursesUrl,
}: CourseExpiringProps) {
  return (
    <BrandEmail
      preview={`${courseTitle} expires in ${daysRemaining} days`}
      subject="Course accreditation expiring"
    >
      <Text style={{ margin: 0, fontSize: 14, color: emailColors.navy }}>
        Dear {companyName},
      </Text>
      <Text style={{ margin: "10px 0 14px 0", fontSize: 14, lineHeight: 1.65, color: emailColors.textMid }}>
        Your accredited course is approaching its expiration date. After it
        expires, attendees can no longer claim certificates for it. To keep it
        active, renew it from My Courses. Renewing re-submits the course for AADB
        review and, once approved, extends the accreditation for another 3 years.
      </Text>
      <DetailGrid
        rows={[
          { label: "Course Title", value: courseTitle },
          { label: "Course ID", value: courseIdNumber },
          { label: "Expires", value: expiresAt },
          { label: "Days Remaining", value: String(daysRemaining) },
        ]}
      />
      <CtaButton href={myCoursesUrl} label="Renew this course →" />
    </BrandEmail>
  );
}

CourseExpiringEmail.subject = ({ courseTitle, daysRemaining }: CourseExpiringProps) =>
  `${courseTitle} expires in ${daysRemaining} days · DentalACE`;
