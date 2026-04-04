import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      // Resolve workspace packages to their source so we don't need dist/ builds
      "@emailed/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
      "@emailed/db": path.resolve(__dirname, "../../packages/db/src/index.ts"),
      "@emailed/crypto": path.resolve(__dirname, "../../packages/crypto/src/index.ts"),
      "@emailed/dns": path.resolve(__dirname, "../../services/dns/src/index.ts"),
      "@emailed/reputation": path.resolve(__dirname, "../../services/reputation/src/index.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    testTimeout: 10_000,
    setupFiles: ["./tests/setup.ts"],
  },
});
