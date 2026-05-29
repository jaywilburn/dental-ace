import "server-only";

/*
  Detects whether we run the real Stripe checkout flow or the dev mock flow.

  Real mode requires BOTH a STRIPE_SECRET_KEY env var and STRIPE_MOCK_MODE
  not set to "true". This means new clones with no Stripe keys default to
  mock mode automatically.
*/
export function isMockMode(): boolean {
  if (process.env.STRIPE_MOCK_MODE === "true") return true;
  if (!process.env.STRIPE_SECRET_KEY) return true;
  return false;
}
