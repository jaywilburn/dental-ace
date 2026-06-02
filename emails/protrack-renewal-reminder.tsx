import { Text } from "@react-email/components";
import { BrandEmail, DetailGrid, CtaButton, emailColors } from "./_brand";

export type ProtrackRenewalReminderProps = {
  firstName: string;
  state: string;
  renewalDate: string;
  daysRemaining: number;
  completedHours: string;
  requiredHours: string;
  remainingHours: string;
  dashboardUrl: string;
};

export default function ProtrackRenewalReminderEmail({
  firstName,
  state,
  renewalDate,
  daysRemaining,
  completedHours,
  requiredHours,
  remainingHours,
  dashboardUrl,
}: ProtrackRenewalReminderProps) {
  return (
    <BrandEmail
      product="pro"
      preview={`Your ${state} renewal is ${daysRemaining} days away`}
      subject={`${daysRemaining} days to your ${state} renewal`}
    >
      <Text style={{ margin: 0, fontSize: 14, color: emailColors.navy }}>
        Hi {firstName},
      </Text>
      <Text
        style={{
          margin: "10px 0 14px 0",
          fontSize: 14,
          lineHeight: 1.65,
          color: emailColors.textMid,
        }}
      >
        Your {state} license renews on {renewalDate}, about {daysRemaining} days
        from now. Here is where your continuing education stands.
      </Text>
      <DetailGrid
        rows={[
          { label: "Renewal Date", value: renewalDate },
          { label: "Completed", value: `${completedHours} hours` },
          { label: "Required", value: `${requiredHours} hours` },
          { label: "Still Needed", value: `${remainingHours} hours` },
        ]}
      />
      <CtaButton href={dashboardUrl} label="Review your progress" />
    </BrandEmail>
  );
}
