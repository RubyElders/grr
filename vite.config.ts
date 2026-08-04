import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  root: "ui",
  clearScreen: false,
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    host: "127.0.0.1",
  },
  test: {
    environment: "jsdom",
    setupFiles: ["../vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx", "src/types.ts"],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 85,
        branches: 85
      }
    }
  }
});
