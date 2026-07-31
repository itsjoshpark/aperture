# Aperture

A local image gallery in the browser. Point it at a folder, browse it Finder-style, delete what you
don't want, and drag the keepers into an order — Aperture then rewrites the filenames to match that
order, sequentially.

Static SPA, deployed to <https://joshuapark.dev/aperture>.

## Commands

Package manager is **pnpm** (pinned via `packageManager`). The toolchain is **Vite+**, whose CLI is
`vp` — it wraps Vite, Vitest, Oxlint, Oxfmt and Rolldown.

| Command      | What it does                                   |
| ------------ | ---------------------------------------------- |
| `pnpm dev`   | dev server                                     |
| `pnpm check` | format + lint + typecheck (`--fix` to autofix) |
| `pnpm test`  | both Vitest projects (see Testing)             |
| `pnpm build` | `vue-tsc -b` then production build             |
| `pnpm e2e`   | Playwright smoke suite                         |

`.vite-hooks/pre-commit` runs `vp check --fix` on staged files.

> If `vp` ever misbehaves (it is at 0.2.x), the npm scripts are thin wrappers — swap their bodies
> for `vite` / `vitest` / `oxlint` directly. No application code depends on Vite+.

## Layout

```
src/
  lib/
    fs/            the ONLY code that touches disk (see below)
    naming.ts      PURE: filename planning + validation
    rename-engine.ts   executes a plan against a FileSystemPort
    sort.ts        natural-name + date comparators
    grid-geometry.ts   PURE: width/gap -> columns, index<->cell, pointer hit-test
    thumbnails.ts  object-URL LRU cache
  composables/     useGallery, useRenameSession, useTileDrag, useKeyboard, ...
  components/
    ui/            shadcn-vue generated primitives — regenerate, don't hand-edit
e2e/               Playwright specs + a test-only harness entry
```

## Things that will bite you

**The File System Access API is Chromium-only.** Safari and Firefox get
`UnsupportedBrowser.vue`. There is deliberately no demo mode.

**You cannot rename a local file directly.** `FileSystemHandle.move()` is shipped only for OPFS
files; for anything from `showDirectoryPicker()` it is behind a Chrome flag. `fsa-adapter.ts` tries
`move()` and falls back to copy-then-delete. Consequence: **renaming resets date-modified**, because
the bytes are rewritten. File contents (and EXIF) are unchanged. The UI says so; keep it saying so.

**Deleting is permanent.** `removeEntry()` does not move anything to the Trash. Dialog copy must
never imply otherwise.

**Renaming must be two-phase.** A naive in-order rename destroys data whenever a target name is
currently held by another file in the set (`b.jpg → 1.jpg` while `1.jpg` still exists). Every file
goes to a `.aperture-tmp-*` name first, then to its target. Do not "optimise" this away.

**Permissions do not survive closing every tab of the origin.** Re-grant with `queryPermission()` /
`requestPermission()` inside a user gesture.

**`memory-adapter.ts` must never be imported from `src/main.ts`.** It is the in-memory fake for
tests and the e2e harness; keeping it out of the entry graph is what keeps it out of the bundle.

**Assets must go through Vite.** `base` is `/aperture/`, so a hardcoded leading-slash URL will 404
in production.

## Testing

There is **no `happy-dom` or `jsdom`**, on purpose. Most of this app's UI logic is geometry —
column counts, hit-testing a pointer to a grid cell, `IntersectionObserver`, `scrollIntoView` — and
a synthetic DOM has no layout engine, so `getBoundingClientRect()` returns zeros and those tests
would assert nothing. Two Vitest projects instead:

- **`unit`** (`*.test.ts`, node, no DOM): everything in `src/lib/` that is pure or takes a
  `FileSystemPort` argument. This is where the rename engine is covered, against `MemoryAdapter`.
- **`browser`** (`*.browser.test.ts`, real Chromium via Playwright): components whose behaviour
  depends on real layout.

Put a new test in `unit` unless it genuinely needs layout. If you find yourself mocking
`getBoundingClientRect`, it belongs in `browser`.

## Deployment

Pushing to `main` builds and deploys to GitHub Pages. `main` is protected: PRs only, and `verify`
and `e2e` must be green to merge.

`itsjoshpark.github.io` carries the `joshuapark.dev` CNAME, so GitHub serves this project site under
that custom domain automatically. Nothing in the personal-site repo needs to change.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->
