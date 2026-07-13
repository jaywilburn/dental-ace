import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

/*
  Shared layout for every transactional email. Renders the navy header band,
  body container, footer, and an inline-styled greeting. Children render
  inside the body card.

  All styles are inline / via the @react-email/components style prop — Resend
  HTML transforms work best that way.
*/

const colors = {
  navy: "#0B1A2E",
  ace: "#C8971A",
  aceLight: "#E4C060",
  surface: "#F4F7FB",
  textMid: "#344E6E",
  textMuted: "#6B87A8",
  border: "#CDD9EE",
  white: "#FFFFFF",
};

const fontStack =
  "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const serifStack =
  "'Cormorant Garamond', Georgia, 'Times New Roman', serif";

export function BrandEmail({
  preview,
  subject,
  product = "ace",
  children,
}: {
  preview: string;
  subject: string;
  product?: "suite" | "ace" | "pro" | "ver";
  children: React.ReactNode;
}) {
  const wordmark =
    product === "pro" ? (
      <>
        Pro<span style={{ color: colors.aceLight }}>Track</span>
      </>
    ) : product === "ver" ? (
      <>
        <span style={{ color: colors.aceLight }}>Verify</span>
      </>
    ) : product === "suite" ? (
      <>
        Dental<span style={{ color: colors.aceLight }}>ACE</span> One
      </>
    ) : (
      <>
        Dental<span style={{ color: colors.aceLight }}>ACE</span>
      </>
    );
  const eyebrow =
    product === "pro"
      ? "CE Tracking for Dental Professionals"
      : product === "ver"
        ? "State Board CE Compliance"
        : product === "suite"
          ? "An AADB Program"
          : "AADB Accredited Continuing Education";

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: colors.surface,
          fontFamily: fontStack,
          color: colors.textMid,
          margin: 0,
          padding: "32px 0",
        }}
      >
        <Container
          style={{
            backgroundColor: colors.white,
            borderRadius: 12,
            overflow: "hidden",
            maxWidth: 620,
            margin: "0 auto",
            boxShadow: "0 2px 8px rgba(11, 26, 46, 0.05)",
          }}
        >
          <Section
            style={{
              backgroundColor: colors.navy,
              padding: "20px 28px",
            }}
          >
            <Heading
              as="h1"
              style={{
                margin: 0,
                fontFamily: serifStack,
                fontSize: 22,
                fontWeight: 700,
                color: colors.white,
              }}
            >
              {wordmark}
            </Heading>
            <Text
              style={{
                margin: "2px 0 0 0",
                fontSize: 11,
                color: "rgba(255,255,255,0.45)",
                letterSpacing: 1,
              }}
            >
              {eyebrow}
            </Text>
          </Section>
          <Section style={{ padding: "28px" }}>
            <Heading
              as="h2"
              style={{
                margin: "0 0 18px 0",
                fontFamily: serifStack,
                fontSize: 24,
                fontWeight: 700,
                color: colors.navy,
              }}
            >
              {subject}
            </Heading>
            {children}
          </Section>
          <Hr style={{ borderColor: colors.border, margin: 0 }} />
          <Section style={{ padding: "16px 28px", backgroundColor: colors.surface }}>
            <Text
              style={{
                margin: 0,
                fontSize: 11,
                color: colors.textMuted,
                lineHeight: 1.5,
              }}
            >
              {product === "pro"
                ? "ProTrack · An AADB Program · dentalace.org"
                : product === "ver"
                  ? "Verify · An AADB Program · dentalace.org"
                  : product === "suite"
                    ? "DentalACE One · An AADB Program · dentalace.org"
                    : "DentalACE · AADB Continuing Education Program · dentalace.org"}
              <br />
              Questions? Contact{" "}
              <a
                href="mailto:info@dentalace.org"
                style={{ color: colors.aceLight, textDecoration: "none" }}
              >
                info@dentalace.org
              </a>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const emailColors = colors;
export const emailFontStack = fontStack;
export const emailSerifStack = serifStack;

export function DetailGrid({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <Section
      style={{
        backgroundColor: colors.surface,
        borderRadius: 8,
        padding: "16px 18px",
        margin: "8px 0 18px 0",
      }}
    >
      {/* Table layout, not flexbox: email clients (Gmail, Outlook, Apple Mail)
          drop display:flex / justify-content, which collapsed each label and
          value together with no gap. A two-column table with right padding on
          the label cell guarantees the separation in every client and aligns
          the values into a column. */}
      <table
        cellPadding={0}
        cellSpacing={0}
        style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
      >
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td
                style={{
                  padding: "5px 16px 5px 0",
                  color: colors.textMuted,
                  verticalAlign: "top",
                  whiteSpace: "nowrap",
                  width: "1%",
                }}
              >
                {row.label}
              </td>
              <td
                style={{
                  padding: "5px 0",
                  color: colors.navy,
                  fontWeight: 600,
                  verticalAlign: "top",
                }}
              >
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

export function CtaButton({ href, label }: { href: string; label: string }) {
  return (
    <Section style={{ margin: "18px 0" }}>
      <a
        href={href}
        style={{
          display: "inline-block",
          backgroundColor: colors.ace,
          color: colors.navy,
          padding: "11px 22px",
          borderRadius: 7,
          fontSize: 13,
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        {label}
      </a>
    </Section>
  );
}
