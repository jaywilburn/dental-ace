/*
  Maps a stored course delivery value to the client's four display buckets for
  the "Course Format" line on completion certificates. The canonical stored
  values are DELIVERY_FORMATS in lib/forms/application/schemas.ts
  ('Live/In Person', 'Live/Online', 'On Demand Video', 'On Demand Audio',
  'Printed Course') plus the retired 'Live Event' / 'Live/Virtual' values that
  isLiveFormat still accepts (never migrated).

  The event mapping ('Live Event' -> 'LIVE In Person') is an approved
  assumption pending client confirmation. Unknown/other values are returned
  trimmed rather than dropped, so no cert ever silently loses format data.
*/

export function courseFormatLabel(
  deliveryMethod: string | null | undefined,
): string | null {
  if (!deliveryMethod) return null;
  const value = deliveryMethod.trim();
  if (value === "") return null;

  switch (value) {
    case "Live/In Person":
      return "LIVE In Person";
    case "Live/Online":
      return "LIVE Online (Webinar, Zoom, etc)";
    case "On Demand Video":
    case "On Demand Audio":
      return "On-Demand";
    case "Printed Course":
      return "Self Study/Written";
    // Legacy / event values (see isLiveFormat in schemas.ts).
    case "Live Event":
      return "LIVE In Person";
    case "Live/Virtual":
      return "LIVE Online (Webinar, Zoom, etc)";
    default:
      return value;
  }
}
