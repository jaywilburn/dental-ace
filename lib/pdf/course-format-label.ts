/*
  Maps a stored course delivery value to one of the four canonical "Course
  Format" labels for the line printed on the Letter of Accreditation and the
  completion certificate. The canonical labels are COURSE_FORMATS in
  lib/forms/application/schemas.ts ('LIVE In Person', 'LIVE Online',
  'On Demand Recording', 'Self Study/Printed').

  New records already store a canonical value (it passes through unchanged).
  The legacy DELIVERY_FORMATS values ('Live/In Person', 'Live/Online',
  'On Demand Video', 'On Demand Audio', 'Printed Course') and the retired
  'Live Event' / 'Live/Virtual' values (never migrated) are folded onto the
  canonical labels here. Unknown/other values are returned trimmed rather than
  dropped, so no cert ever silently loses format data.
*/

export function courseFormatLabel(
  deliveryMethod: string | null | undefined,
): string | null {
  if (!deliveryMethod) return null;
  const value = deliveryMethod.trim();
  if (value === "") return null;

  switch (value) {
    // Canonical values pass through unchanged.
    case "LIVE In Person":
      return "LIVE In Person";
    case "LIVE Online":
      return "LIVE Online";
    case "On Demand Recording":
      return "On Demand Recording";
    case "Self Study/Printed":
      return "Self Study/Printed";
    // Legacy DELIVERY_FORMATS values folded onto the canonical labels.
    case "Live/In Person":
      return "LIVE In Person";
    case "Live/Online":
      return "LIVE Online";
    case "On Demand Video":
    case "On Demand Audio":
      return "On Demand Recording";
    case "Printed Course":
      return "Self Study/Printed";
    // Retired / event values (see isLiveFormat in schemas.ts).
    case "Live Event":
      return "LIVE In Person";
    case "Live/Virtual":
      return "LIVE Online";
    default:
      return value;
  }
}
