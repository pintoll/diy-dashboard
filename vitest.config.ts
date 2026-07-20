import { defineConfig } from "vitest/config";
import { resolve } from "path";

// Unit tests only cover pure, environment-agnostic logic (no Electron / DOM),
// e.g. the pomodoro desk-attribution interval math. The aliases mirror
// electron.vite.config.ts so those modules resolve the same way as in the app.
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src/renderer"),
      "@shared": resolve(__dirname, "src/shared"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
