import {
  isLiveFormat,
  type ApplicationDataRead,
} from "@/lib/forms/application/schemas";
import { sanitizeRichText } from "@/lib/forms/application/rich-text";

/*
  Pure row builders for the read-only application detail views. Shared by the
  reviewer detail screen (app/reviewer/[applicationId]) and the company-facing
  read-only view (app/company/applications/[id]) so both render the same
  fields, including the legacy-field handling for applications saved before
  the 2026-06 form changes.
*/

export type DetailRow = {
  label: string;
  value: string;
  full?: boolean;
  // html rows must contain ONLY sanitizeRichText() output (see rich-text.ts).
  html?: boolean;
};

export function organizationRows(data: ApplicationDataRead): DetailRow[] {
  return [
    ...(data.organizationName ? [{ label: "Organization", value: data.organizationName, full: true }] : []),
    ...(data.organizationAddress ? [{ label: "Address", value: data.organizationAddress, full: true }] : []),
    ...(data.adminName ? [{ label: "Process Administrator", value: data.adminName }] : []),
    ...(data.adminEmail ? [{ label: "Admin Email", value: data.adminEmail }] : []),
    ...(data.adminPhone ? [{ label: "Admin Phone", value: data.adminPhone }] : []),
  ];
}

export function courseInfoRows(data: ApplicationDataRead): DetailRow[] {
  return [
    { label: "Course Title", value: data.courseTitle, full: true },
    { label: "CE Credit Hours", value: `${data.ceCreditHours.toFixed(1)} hours` },
    // Legacy fields: only present on applications saved before the
    // 2026-06 form changes.
    ...(data.courseDurationHours != null
      ? [{ label: "Course Duration", value: `${data.courseDurationHours.toFixed(1)} hours` }]
      : []),
    { label: "Category", value: data.subjectMatter },
    { label: "Course Format", value: data.deliveryFormat },
    ...(data.primaryDistributionFormat
      ? [{ label: "Most-Used Format", value: data.primaryDistributionFormat }]
      : []),
    ...(data.shortDescription
      ? [{ label: "Short Description", value: data.shortDescription, full: true }]
      : []),
    ...(data.adaCerpCategory
      ? [{ label: "ADA CERP Category", value: data.adaCerpCategory }]
      : []),
    ...(isLiveFormat(data.deliveryFormat)
      ? [
          { label: "Combined Cert?", value: data.combinedCert ? "Yes" : "No" },
          {
            label: "Sessions submitted separately?",
            value: data.submitSessionsSeparately ? "Yes" : "No",
          },
        ]
      : []),
    { label: "Public Protection Statement", value: data.publicProtectionStatement, full: true },
    { label: "Course Objectives", value: data.courseObjectives, full: true },
    // Text since 2026-06; legacy applications carry an uploaded file under
    // this key instead, shown in the Attachments card.
    ...(typeof data.courseOutline === "string"
      ? [{ label: "Course Outline", value: data.courseOutline, full: true }]
      : []),
  ];
}

export function creatorRows(data: ApplicationDataRead): DetailRow[] {
  return [
    { label: "Creator Name", value: data.creatorName },
    { label: "Credentials", value: data.credentials },
    { label: "Current Position", value: data.currentPosition, full: true },
    ...(data.creatorEmail ? [{ label: "Creator Email", value: data.creatorEmail }] : []),
    ...(data.creatorPhone ? [{ label: "Creator Phone", value: data.creatorPhone }] : []),
    ...(data.creatorAddress ? [{ label: "Creator Address", value: data.creatorAddress, full: true }] : []),
    ...(data.highestDegree ? [{ label: "Highest Degree", value: data.highestDegree }] : []),
    ...(data.educationPart1 ? [{ label: "Education Part 1", value: data.educationPart1, full: true }] : []),
    ...(data.educationPart2 ? [{ label: "Education Part 2", value: data.educationPart2, full: true }] : []),
    ...(data.educationPart3 ? [{ label: "Education Part 3", value: data.educationPart3, full: true }] : []),
    ...(data.educationPart4 ? [{ label: "Education Part 4", value: data.educationPart4, full: true }] : []),
    ...(data.creatorExperience ? [{ label: "Experience Relative to Subject", value: data.creatorExperience, full: true }] : []),
    // Text since 2026-06; legacy applications carry an uploaded file under
    // this key instead, shown in the Attachments card.
    ...(typeof data.cvResume === "string"
      ? [{ label: "CV / Resume", value: data.cvResume, full: true }]
      : []),
    // Bio lineage: current applications carry rich text (detailedBioHtml);
    // briefly-uploaded bios show under Attachments; pre-2026-06 applications
    // carry plain text.
    ...(data.detailedBioHtml
      ? [
          {
            label: "Detailed Bio",
            value: sanitizeRichText(data.detailedBioHtml),
            full: true,
            html: true,
          },
        ]
      : []),
    ...(data.professionalBio
      ? [{ label: "Professional Bio", value: data.professionalBio, full: true }]
      : []),
  ];
}

export function presenterRows(data: ApplicationDataRead): DetailRow[] {
  return (data.presenters ?? []).flatMap((p, i) => [
    { label: `Presenter ${i + 1}`, value: `${p.name} · ${p.role}` },
    ...(p.commercialDisclosure ? [{ label: "Commercial Disclosure", value: p.commercialDisclosure, full: true }] : []),
    ...(p.experience ? [{ label: "Experience", value: p.experience, full: true }] : []),
    ...(p.training ? [{ label: "Training Received", value: p.training, full: true }] : []),
    ...(p.bio ? [{ label: "Bio", value: p.bio, full: true }] : []),
  ]);
}
