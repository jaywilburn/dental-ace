import { DeliveryFormat } from "@prisma/client";

/*
  Heuristics that map a DentalACE course onto a ProTrack CE category and delivery
  format during auto-sync. Intentionally conservative: anything unrecognized
  falls back to "General CE" so hours are never lost, and the licensee can
  re-categorize a manual upload if needed. Keep all the guessing in this one
  module.
*/

export function mapCategory(input: {
  courseType?: string | null;
  courseTitle?: string | null;
}): string {
  const hay = `${input.courseType ?? ""} ${input.courseTitle ?? ""}`.toLowerCase();
  if (/jurisprud|dental law|\bethic/.test(hay)) return "Jurisprudence";
  if (/sedation|anesthes|anaesthes|nitrous/.test(hay)) return "Sedation";
  if (/infection|steriliz|sterilis|\bosha\b/.test(hay)) return "Infection Control";
  if (/emergenc|\bcpr\b|\bbls\b|\bacls\b|resuscitat/.test(hay)) {
    return "Med. Emergencies";
  }
  return "General CE";
}

export function mapDeliveryFormat(method?: string | null): DeliveryFormat | null {
  if (!method) return null;
  const m = method.toLowerCase();
  if (m.includes("hybrid")) return DeliveryFormat.HYBRID;
  if (m.includes("person") || m.includes("live") || m.includes("classroom")) {
    return DeliveryFormat.IN_PERSON;
  }
  if (
    m.includes("online") ||
    m.includes("self-study") ||
    m.includes("self study") ||
    m.includes("webinar") ||
    m.includes("virtual")
  ) {
    return DeliveryFormat.ONLINE;
  }
  return null;
}
