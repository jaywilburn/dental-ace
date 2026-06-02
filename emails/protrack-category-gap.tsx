import { Section, Text } from "@react-email/components";
import { BrandEmail, CtaButton, emailColors } from "./_brand";

export type ProtrackCategoryGapProps = {
  firstName: string;
  state: string;
  gaps: { name: string; needed: string }[];
  dashboardUrl: string;
};

export default function ProtrackCategoryGapEmail({
  firstName,
  state,
  gaps,
  dashboardUrl,
}: ProtrackCategoryGapProps) {
  return (
    <BrandEmail
      product="pro"
      preview={`You still need CE in ${gaps.length} ${state} categories`}
      subject="Required CE categories still open"
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
        Your {state} renewal requires specific CE categories that are not complete
        yet. Closing these now keeps you audit-ready.
      </Text>
      <Section
        style={{
          backgroundColor: emailColors.surface,
          borderRadius: 8,
          padding: "14px 18px",
          margin: "8px 0 18px 0",
        }}
      >
        {gaps.map((gap) => (
          <Text
            key={gap.name}
            style={{
              margin: "4px 0",
              fontSize: 13,
              color: emailColors.textMid,
            }}
          >
            • <strong style={{ color: emailColors.navy }}>{gap.name}</strong>:{" "}
            {gap.needed} hours still needed
          </Text>
        ))}
      </Section>
      <CtaButton href={dashboardUrl} label="Close your CE gaps" />
    </BrandEmail>
  );
}
