import { defineConfig } from "drizzle-kit";
import "dotenv/config";

export default defineConfig({
  schema: "./src/db/postgres/schema/index.ts",
  out: "./src/db/postgres/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://asanpay:asanpay@localhost:5432/asanpay",
  },
  strict: true,
  verbose: true,
});
