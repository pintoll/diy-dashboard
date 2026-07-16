import { defineConfig } from "vitest/config";
import { resolve } from "path";

// Unit tests only cover pure, environment-agnostic logic (no Electron / DOM),
// e.g. the pomodoro desk-attribution interval math. The `@` alias mirrors
// electron.vite.config.ts so those modules resolve the same way as in the app.
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src/renderer"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
