import { defineConfig } from "@playwright/test";
import base from "./playwright.config.ts";

/**
 * The built app, served from `dist` the way GitHub Pages serves it.
 *
 * A separate config rather than a second project beside the harness suite:
 * Playwright starts every `webServer` it is given, so one config holding both
 * would make a plain `pnpm e2e` demand a `dist` that a fresh checkout has no
 * reason to have built. Everything but the server, the base URL and which specs
 * to run is inherited.
 */
const baseURL = "http://localhost:4173/aperture/";

export default defineConfig({
  ...base,
  testMatch: "production.spec.ts",

  use: { ...base.use, baseURL },

  webServer: {
    command: "vp preview --port 4173 --strictPort",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
