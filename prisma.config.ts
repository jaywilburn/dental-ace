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
    url: env("DATABASE_URL"),
  },
});
