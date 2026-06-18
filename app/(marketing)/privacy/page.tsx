import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/page-hero";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How DentalACE One collects, uses, and protects personal information across DentalACE, ProTrack, and Verify.",
};

const LAST_UPDATED = "May 30, 2026";

type Section = { heading: string; body: React.ReactNode };

const sections: Section[] = [
  {
    heading: "1. Who we are",
    body: (
      <>
        DentalACE One is operated by the American Association of Dental Boards
        (AADB). The AADB maintains the accreditation standards, the technology,
        and the state board relationships that keep dental continuing education
        credible from the classroom to the renewal. This policy covers the
        DentalACE, ProTrack, and Verify products at dentalace.org. You can
        reach us at{" "}
        <a
          href="mailto:info@dentalace.org"
          className="font-medium text-ace-dark hover:underline"
        >
          info@dentalace.org
        </a>
        .
      </>
    ),
  },
  {
    heading: "2. Information we collect",
    body: (
      <>
        We collect information you provide directly, including your name, email
        address, professional license details, organization, and course or
        certificate records. We also collect limited technical information such
        as your IP address, browser type, and usage activity needed to operate
        and secure the platform.
      </>
    ),
  },
  {
    heading: "3. How we use information",
    body: (
      <>
        We use your information to provide the service: processing course
        applications, issuing and verifying CE certificates, tracking CE hours
        against state requirements, running board audits, processing payments,
        and sending transactional notifications such as certificates, receipts,
        and renewal reminders. We do not sell your personal information.
      </>
    ),
  },
  {
    heading: "4. Service providers",
    body: (
      <>
        We share information with vendors who process it on our behalf, under
        contract, and only as needed to deliver the service, including:
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>Cloud hosting, database, authentication, and file-storage providers.</li>
          <li>
            A PCI-compliant payment processor. Card details are handled by the
            processor, not stored on our servers.
          </li>
          <li>A transactional email delivery provider.</li>
        </ul>
      </>
    ),
  },
  {
    heading: "5. Sharing with state boards",
    body: (
      <>
        DentalACE One is built to connect CE providers, licensees, and
        regulators. CE compliance data for a licensee may be made available to
        the relevant state dental board through Verify, consistent with the
        board&apos;s regulatory authority and applicable law.
      </>
    ),
  },
  {
    heading: "6. Cookies and sessions",
    body: (
      <>
        We use strictly necessary cookies to keep you signed in and to secure
        your session. We do not use third-party advertising cookies.
      </>
    ),
  },
  {
    heading: "7. Data retention",
    body: (
      <>
        We retain accreditation and CE records for as long as needed to support
        licensure, audit, and legal obligations, which may extend beyond the
        life of your account. Other personal information is retained only as
        long as necessary for the purposes described here.
      </>
    ),
  },
  {
    heading: "8. Security",
    body: (
      <>
        We protect your information with encryption in transit, row-level access
        controls, and signed, time-limited URLs for private files. No system is
        perfectly secure, but we work to safeguard your data and to limit access
        to those who need it.
      </>
    ),
  },
  {
    heading: "9. Your rights",
    body: (
      <>
        Depending on your jurisdiction, you may have the right to access,
        correct, or delete your personal information, or to object to certain
        processing. To make a request, email{" "}
        <a
          href="mailto:info@dentalace.org"
          className="font-medium text-ace-dark hover:underline"
        >
          info@dentalace.org
        </a>
        . Some records tied to licensure and audit may be retained where the law
        requires.
      </>
    ),
  },
  {
    heading: "10. Changes to this policy",
    body: (
      <>
        We may update this policy as the platform evolves. Material changes will
        be posted here with a revised effective date.
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <>
      <PageHero eyebrow="Legal" title="Privacy Policy" />

      <section className="bg-white px-5 py-14 md:px-10 md:py-16">
        <div className="mx-auto max-w-[720px]">
          <p className="mb-8 text-sm text-text-muted">
            Last updated: {LAST_UPDATED}
          </p>

          <div className="mb-10 rounded-xl border border-orange/30 bg-orange-bg px-5 py-4">
            <p className="text-sm leading-relaxed text-text-mid">
              <strong className="text-navy">Note:</strong> This policy is a
              working draft pending final legal review. It describes our intended
              practices and will be finalized before public launch.
            </p>
          </div>

          <div className="flex flex-col gap-8">
            {sections.map((s) => (
              <div key={s.heading}>
                <h2 className="mb-2 font-serif text-xl font-bold text-navy">
                  {s.heading}
                </h2>
                <div className="text-pretty text-sm leading-relaxed text-text-mid">
                  {s.body}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
