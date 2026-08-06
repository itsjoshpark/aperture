import { defineConfig, devices } from "@playwright/test";

/**
 * Two suites, and only ever one of them at a time.
 *
 * The default suite runs against the dev server and the test-only harness entry,
 * which mounts the real app over an in-memory folder. Chromium only — Aperture
 * does not work anywhere else, which is the point of `UnsupportedBrowser.vue`.
 *
 * `APERTURE_PRODUCTION` switches to `dist` behind `vp preview`, which is the
 * only way to test the built artifact. It is a flag rather than a second
 * project in one run because the two need different servers, and Playwright
 * starts every `webServer` it is given — so an unflagged `pnpm e2e` would
 * demand a `dist` that a fresh checkout has no reason to have built yet.
 */
const production = !!process.env.APERTURE_PRODUCTION;

const DEV_PORT = 5173;
const PREVIEW_PORT = 4173;
const baseURL = `http://localhost:${production ? PREVIEW_PORT : DEV_PORT}/aperture/`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: production ? "production.spec.ts" : "gallery.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL,
    trace: "on-first-retry",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: production
    ? {
        command: `vp preview --port ${PREVIEW_PORT} --strictPort`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : {
        command: `pnpm dev --port ${DEV_PORT} --strictPort`,
        url: `${baseURL}e2e/harness.html`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
