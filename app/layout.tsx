import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
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
  metadataBase: new URL("https://dentalace.org"),
  title: {
    default: "Dental ACE · The Complete Dental CE Platform",
    template: "%s · Dental ACE",
  },
  description:
    "The complete dental continuing education platform. CE accreditation, license tracking, and state board auditing from the American Association of Dental Boards. An AADB Program, powered by CE Exchange.",
  applicationName: "DentalACE One",
  openGraph: {
    type: "website",
    url: "https://dentalace.org",
    siteName: "DentalACE One",
    title: "Dental ACE · The Complete Dental CE Platform",
    description:
      "Three connected tools, one platform: Dental ACE accreditation, ProTrack CE dashboards, and Verify board auditing. Built with the AADB.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dental ACE · The Complete Dental CE Platform",
    description:
      "Three connected tools, one platform: Dental ACE accreditation, ProTrack CE dashboards, and Verify board auditing. Built with the AADB.",
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
      className={`${cormorant.variable} ${dmSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
