import { expect, test } from "@playwright/test";

/**
 * The built artifact, served the way GitHub Pages serves it.
 *
 * The rest of the suite drives `e2e/harness.html` against the dev server, which
 * is the only way to reach the gallery — the harness is not a build input, so it
 * is not in `dist`, which is exactly what keeps `MemoryAdapter` out of what
 * users download. That leaves a class of failure no other test can see: the app
 * is served from `/aperture/`, so an asset URL written without the base, a
 * missing file, or a chunk that fails to execute all pass every check up to this
 * one and 404 in production.
 *
 * So these assert what only the real bundle over a real static server can say.
 * They cannot open a folder, and should not try.
 */

test("serves the built app from the base path with every asset resolving", async ({ page }) => {
  const broken: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 400) broken.push(`${response.status()} ${response.url()}`);
  });

  const failed: string[] = [];
  page.on("requestfailed", (request) => void failed.push(request.url()));

  const errors: string[] = [];
  page.on("pageerror", (error) => void errors.push(error.message));

  await page.goto("./");

  // Rendered by Vue, so reaching it means the entry chunk loaded and ran.
  await expect(page.getByRole("button", { name: "Open folder…" })).toBeVisible();

  expect(broken).toEqual([]);
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});

/**
 * The page's own globals, described rather than imported: these specs typecheck
 * under the Node config, which has no DOM lib. `gallery.spec.ts` does the same
 * for its harness hooks.
 */
interface StyleProbe {
  getComputedStyle: (element: unknown) => { marginTop: string };
}

test("applies its stylesheet rather than falling back to the UA's", async ({ page }) => {
  await page.goto("./");

  // Tailwind's preflight zeroes body margin; unstyled, the UA gives it 8px. A
  // stylesheet that 404s leaves the app readable enough to pass a smoke test
  // without this.
  const margin = await page
    .locator("body")
    .evaluate((body) => (globalThis as unknown as StyleProbe).getComputedStyle(body).marginTop);

  expect(margin).toBe("0px");
});

test("resolves the favicon through the base", async ({ page }) => {
  const response = await page.request.get("./favicon.svg");

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("svg");
});
