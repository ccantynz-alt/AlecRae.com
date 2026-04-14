import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, "src/main.ts"),
        formats: ["cjs"],
        fileName: () => "main.cjs",
      },
      outDir: "dist",
      emptyOutDir: true,
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, "src/preload.ts"),
        formats: ["cjs"],
        fileName: () => "preload.cjs",
      },
      outDir: "dist",
      emptyOutDir: false,
    },
  },
});
