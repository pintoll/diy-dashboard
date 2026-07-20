import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    // src/shared holds the handful of pure modules that main and the renderer
    // must agree on (pomodoro timer math). Aliased in both so neither side
    // reaches for a relative path that climbs out of its own tree.
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "src/shared"),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/main/index.ts"),
        },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/preload/index.ts"),
        },
      },
    },
  },
  renderer: {
    root: "src/renderer",
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/renderer/index.html"),
        },
      },
    },
    resolve: {
      alias: {
        "@": resolve(__dirname, "src/renderer"),
        "@shared": resolve(__dirname, "src/shared"),
      },
    },
    plugins: [react()],
    css: {
      postcss: resolve(__dirname, "postcss.config.mjs"),
    },
  },
});
