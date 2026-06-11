import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Vitest config for @alecrae/dns.
 *
 * `@alecrae/db` publishes its entry as ./dist/index.js, which only exists
 * after a package build. Tests mock the package (vi.mock) but Vite still has
 * to resolve the specifier, so alias it to the TypeScript source.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@alecrae/db": fileURLToPath(
        new URL("../../packages/db/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
  },
});
