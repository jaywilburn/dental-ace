#!/usr/bin/env bash
# Wrapper for the Stripe MCP server (@stripe/mcp, Stripe's official agent toolkit).
# Loads .env.local so STRIPE_SECRET_KEY doesn't have to live in the user's shell
# rc file. Claude Code launches us with cwd = project root.
#
# Use a TEST key (sk_test_...). The same key drives the app's real-mode detection,
# so keep STRIPE_MOCK_MODE=true in .env.local while developing — that keeps the app
# in mock mode (mock checkout pages still work) while this MCP can still manage the
# live Stripe catalog. See CLAUDE.md → Stripe.
#
# Tools are scoped to catalog management (products/prices/coupons/payment links).
# Broaden to --tools=all if you need customers, subscriptions, refunds, etc.

if [ -f .env.local ]; then
  set -a
  . ./.env.local
  set +a
fi

if [ -z "${STRIPE_SECRET_KEY:-}" ]; then
  echo "run-stripe-mcp.sh: STRIPE_SECRET_KEY is not set in .env.local" >&2
  exit 1
fi

exec npx -y @stripe/mcp \
  --tools=products.create,products.read,prices.create,prices.read,coupons.create,coupons.read,paymentLinks.create \
  --api-key="$STRIPE_SECRET_KEY"
