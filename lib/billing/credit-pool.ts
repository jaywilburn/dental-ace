/*
  Pure decision: which credit pool a submission spends. Expedited wins only if
  the customer opted in AND the company has an expedited credit; otherwise the
  standard pool pays if it can; otherwise no credit is available.
*/

export type CreditPool = "expedited" | "standard" | "none";

export function chooseCreditPool(args: {
  useExpedited: boolean;
  applicationCredits: number;
  expeditedCredits: number;
}): CreditPool {
  if (args.useExpedited && args.expeditedCredits > 0) return "expedited";
  if (args.applicationCredits > 0) return "standard";
  return "none";
}
