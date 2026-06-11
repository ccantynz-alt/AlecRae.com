import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  // Point at the COMPILED schema (dist), not the TS source. drizzle-kit's
  // esbuild loader does not rewrite explicit `./x.js` import specifiers back to
  // `.ts`, so loading `src/schema/*` fails with MODULE_NOT_FOUND. The compiled
  // output has real `.js` files, which resolves cleanly. `bun run build` is
  // wired into db:push / db:generate so dist is always current.
  schema: "./dist/schema/*.js",
  out: "./src/migrations",
  dbCredentials: {
    url: process.env["DATABASE_URL"]!,
  },
  verbose: true,
  strict: true,
});
