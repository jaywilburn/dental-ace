#!/usr/bin/env bash
# Wrapper for the Supabase MCP server.
# Loads .env.local so SUPABASE_ACCESS_TOKEN doesn't have to live in the user's
# shell rc file. Claude Code launches us with cwd = project root.

if [ -f .env.local ]; then
  set -a
  . ./.env.local
  set +a
fi

exec npx -y @supabase/mcp-server-supabase@latest \
  --project-ref=qvfibdvqbsioyixvwbgq \
  --features=database,storage,functions,docs,debugging
