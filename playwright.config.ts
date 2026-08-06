import { defineConfig, devices } from "@playwright/test";

/**
 * Runs against the dev server and the test-only harness entry, which mounts the
 * real app over an in-memory folder. Chromium only — Aperture does not work
 * anywhere else, which is the point of `UnsupportedBrowser.vue`.
 *
 * The built app is a different suite with a different server:
 * `playwright.production.config.ts`.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "gallery.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: "http://localhost:5173/aperture/",
    trace: "on-first-retry",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    command: "pnpm dev --port 5173 --strictPort",
    url: "http://localhost:5173/aperture/e2e/harness.html",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
