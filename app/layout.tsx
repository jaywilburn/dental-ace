import type { Metadata } from "next";
import { DM_Serif_Display, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// DM Serif Display ships a single weight (400) only. Headings that use
// font-bold/font-semibold are faux-bolded by the browser, which reads fine
// since this is already a heavy display serif.
const dmSerif = DM_Serif_Display({
  variable: "--font-dm-serif",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.dentalace.org"),
  title: {
    default: "DentalACE One · The Complete Dental CE Platform",
    template: "%s · DentalACE One",
  },
  description:
    "The complete dental continuing education platform. CE accreditation, license tracking, and state board auditing, operated by the American Association of Dental Boards.",
  applicationName: "DentalACE One",
  openGraph: {
    type: "website",
    url: "https://www.dentalace.org",
    siteName: "DentalACE One",
    title: "DentalACE One · The Complete Dental CE Platform",
    description:
      "Three connected tools, one platform: DentalACE accreditation, ProTrack CE dashboards, and Verify board auditing. Operated by the AADB.",
  },
  twitter: {
    card: "summary_large_image",
    title: "DentalACE One · The Complete Dental CE Platform",
    description:
      "Three connected tools, one platform: DentalACE accreditation, ProTrack CE dashboards, and Verify board auditing. Operated by the AADB.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSerif.variable} ${dmSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
