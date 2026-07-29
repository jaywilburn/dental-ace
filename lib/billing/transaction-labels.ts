/*
  Display labels for billing_transactions rows. Shared by the admin company
  panel and both customer-facing ledgers so the three copies of this switch
  can't drift.

  ADMIN_OVERRIDE is the legacy type that did not record which balance moved
  (see prisma/migrations/20260729190000_split_admin_override_txn_types). Rows
  written after 2026-07-29 name their balance; older rows can only be labelled
  generically because the underlying data never captured it.

  Quantity is signed: an admin adjustment can remove from a balance, so these
  helpers must read correctly for negatives.
*/

export function txnLabel(type: string): string {
  switch (type) {
    case "APP_CREDIT":
      return "Application credits";
    case "CERT_BUNDLE":
      return "Certificate bundle";
    case "ADMIN_OVERRIDE_APP_CREDITS":
      return "Admin adjustment (application credits)";
    case "ADMIN_OVERRIDE_CERTS":
      return "Admin adjustment (certificates)";
    case "ADMIN_OVERRIDE":
      return "Admin adjustment";
    default:
      return type;
  }
}

/** Singular noun for the thing this transaction moved. */
export function txnUnit(type: string): string {
  switch (type) {
    case "APP_CREDIT":
    case "ADMIN_OVERRIDE_APP_CREDITS":
      return "credit";
    case "CERT_BUNDLE":
    case "ADMIN_OVERRIDE_CERTS":
      return "certificate";
    default:
      return "adjustment";
  }
}

/**
 * Human-readable quantity, e.g. "50 certificates" or "155 credits removed".
 * Negative quantities only ever come from an admin adjustment.
 */
export function txnQuantityText(type: string, quantity: number): string {
  const unit = txnUnit(type);
  const n = Math.abs(quantity);
  const noun = `${unit}${n === 1 ? "" : "s"}`;
  return quantity < 0 ? `${n} ${noun} removed` : `${n} ${noun}`;
}
