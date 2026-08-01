import { fileURLToPath, URL } from "node:url";
import { playwright } from "vite-plus/test/browser-playwright";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig, lazyPlugins } from "vite-plus";

// Served from https://joshuapark.dev/aperture/ — every asset URL must go through
// Vite (imports or `new URL(..., import.meta.url)`), never a hardcoded "/" path.
export default defineConfig({
  base: "/aperture/",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  plugins: lazyPlugins(() => [vue(), tailwindcss()]),

  // `heic-decode` carries libheif: 1.5 MB of CommonJS with a megabyte of wasm
  // inlined as base64. Left to be transformed on demand, the first HEIC after a
  // cold `pnpm dev` blocks for over a minute. Pre-bundling moves that to server
  // startup, where esbuild does it once in a moment.
  optimizeDeps: {
    include: ["heic-decode"],
  },

  // Two test projects, no DOM shim. Pure logic runs in node; anything depending on
  // real layout (grid geometry, IntersectionObserver, scrollIntoView) runs in a real
  // Chromium, which CI already installs for Playwright.
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.browser.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
