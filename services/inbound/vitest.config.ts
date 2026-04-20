import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@emailed/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
      "@emailed/db": path.resolve(__dirname, "../../packages/db/src/index.ts"),
      "@emailed/crypto": path.resolve(__dirname, "../../packages/crypto/src/index.ts"),
      "@emailed/mta": path.resolve(__dirname, "../mta/src/index.ts"),
      "@emailed/ai-engine": path.resolve(__dirname, "../ai-engine/src/index.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    testTimeout: 10_000,
  },
});