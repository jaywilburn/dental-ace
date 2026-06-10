import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Next.js convention is .env.local; load it explicitly so Prisma sees the same vars.
config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // This config is CLI-only (the runtime client reads process.env.DATABASE_URL
    // via the driver adapter in lib/prisma.ts). Point the CLI at the direct
    // session connection: pgbouncer transaction mode can't run DDL or hold the
    // advisory lock prisma migrate requires.
    url: env("DIRECT_URL"),
  },
});
