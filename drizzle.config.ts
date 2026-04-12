import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./packages/db/src/schema/*.ts",
  out: "./packages/db/src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "postgres://alecrae:dev_password@localhost:5432/alecrae",
  },
  verbose: true,
  strict: true,
});
