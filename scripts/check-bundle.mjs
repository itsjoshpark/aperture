#!/usr/bin/env node
/**
 * The build invariants, checked instead of remembered.
 *
 * Both are documented in AGENTS.md and neither is visible from the code that
 * would break them: the in-memory fake reaches the bundle by being imported
 * from anywhere in `src/main.ts`'s graph, and an asset URL breaks by being
 * written the way it would work anywhere not served from a subpath. Both ship
 * green and fail in production.
 *
 * Run after `vp build`, against `dist`.
 */

import { readdir, readFile } from "node:fs/promises";
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");
const SRC = join(ROOT, "src");
const ENTRY = join(SRC, "main.ts");
const BASE = "/aperture/";

/** Modules that exist for tests and the e2e harness, and must stay out of the app. */
const TEST_ONLY = ["src/lib/fs/memory-adapter.ts", "src/lib/fs/fixtures.ts"];

const failures = [];
const fail = (message) => void failures.push(message);

// ------------------------------------------------------------------ reachability

const IMPORT_PATTERN =
  /(?:\bfrom\s*|\bimport\s*|\bimport\(\s*|new URL\(\s*)["']([^"']+)["']|\bimport\s+["']([^"']+)["']/g;

/**
 * Turn a specifier into a file, the way the `@` alias and Vite's extension
 * resolution do. Bare specifiers are dependencies and stop the walk.
 */
function resolveSpecifier(specifier, from) {
  let base;
  if (specifier.startsWith("@/")) base = join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(from), specifier);
  else return null;

  // A bare directory resolves to its `index.ts`, so the plain path is only a
  // candidate when it is genuinely a file — `@/components/ui/button` is not.
  for (const candidate of [base, `${base}.ts`, `${base}.vue`, join(base, "index.ts")]) {
    if (isFile(candidate)) return candidate;
  }
  return null;
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Every module `src/main.ts` pulls in, including through `.vue` files and the
 * `new URL(..., import.meta.url)` that spawns the HEIC worker.
 *
 * Done over the source rather than the built output because minification renames
 * exported class names — a bundle grep for `MemoryAdapter` finds nothing even
 * when the whole module is sitting in the chunk, which is a check that reports
 * success for the one thing it exists to catch.
 */
async function reachableFromEntry() {
  const seen = new Set();
  const queue = [ENTRY];

  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);

    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const specifier = match[1] ?? match[2];
      if (!specifier) continue;
      const resolved = resolveSpecifier(specifier, file);
      if (resolved) queue.push(resolved);
    }
  }

  return seen;
}

async function checkEntryGraph() {
  const reachable = await reachableFromEntry();

  for (const testOnly of TEST_ONLY) {
    if (reachable.has(join(ROOT, testOnly))) {
      fail(
        `${testOnly} is reachable from src/main.ts, so it ships to users. ` +
          `The e2e harness has its own HTML entry — import it from there instead.`,
      );
    }
  }

  // A graph that collapsed to almost nothing means the walk broke, not that the
  // app got smaller, and would pass the check above for the wrong reason.
  if (reachable.size < 20) {
    fail(`Only ${reachable.size} modules reachable from src/main.ts — the import walk is broken.`);
  }
}

// ---------------------------------------------------------------- built output

/**
 * A backstop on the shipped bundle. String literals are the only thing that
 * survives minification intact, so these are the fake's error messages rather
 * than its name.
 */
const TEST_ONLY_LITERALS = ["No such file: ", "Permission denied"];

async function checkBundle() {
  const assets = join(DIST, "assets");
  const files = (await readdir(assets)).filter((name) => name.endsWith(".js"));

  if (files.length === 0) fail("dist/assets holds no JavaScript — did the build run?");

  for (const file of files) {
    const source = await readFile(join(assets, file), "utf8");
    for (const literal of TEST_ONLY_LITERALS) {
      if (source.includes(literal)) {
        fail(`Test-only code reached dist/assets/${file} (found ${JSON.stringify(literal)}).`);
      }
    }
  }
}

/**
 * Every root-relative URL has to carry the base, which is really a check that
 * `base` is still set: Vite rewrites the attributes in `index.html` itself, so
 * what this catches is the config losing `/aperture/` and every asset silently
 * moving to the origin root.
 *
 * URLs built at runtime are a different problem and not one a static read can
 * see — `production.spec.ts` catches those by asserting nothing 404s.
 */
async function checkAssetUrls() {
  const html = await readFile(join(DIST, "index.html"), "utf8");

  for (const [, attribute, url] of html.matchAll(/\b(src|href)="([^"]+)"/g)) {
    if (!url.startsWith("/") || url.startsWith(BASE) || url.startsWith("//")) continue;
    fail(`${attribute}="${url}" in dist/index.html does not go through the ${BASE} base.`);
  }
}

await checkEntryGraph();
await checkBundle();
await checkAssetUrls();

if (failures.length > 0) {
  console.error("Bundle check failed:\n");
  for (const failure of failures) console.error(`  • ${failure}`);
  process.exit(1);
}

console.log(
  `Bundle check passed: ${relative(ROOT, ENTRY)} does not reach the test fakes, ` +
    `and every asset URL is under ${BASE}.`,
);
