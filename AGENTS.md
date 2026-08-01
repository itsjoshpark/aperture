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
  main.ts          production entry: real disk
  mount.ts         builds the app around an Aperture instance
  lib/
    fs/            the ONLY code that touches disk (see below)
      types.ts         FileSystemPort — the seam everything else is written against
      fsa-adapter.ts   File System Access implementation
      memory-adapter.ts   in-memory fake (tests + harness only)
      folder-source.ts    where folders come from; swapped by the harness
      handle-store.ts     IndexedDB, remembers the last folder
    naming.ts          PURE: filename planning + validation
    rename-engine.ts   executes a plan against a FileSystemPort
    sort.ts            natural-name + date comparators
    grid-geometry.ts   PURE: width/gap -> columns, index<->cell, pointer hit-test
    thumbnails.ts      object-URL LRU cache
    file-names.ts      PURE: split base/extension, recognise images, flag undrawable ones
  composables/
    useAperture.ts     the store; provided at app level, injected everywhere
    useGallery.ts      entries, sort, selection, delete
    useRenameSession.ts   draft order, affixes, apply/undo
    useTileDrag.ts     Pointer Events drag-reorder, no library
    useKeyboard.ts     the whole key map
    useUnsavedGuard.ts    beforeunload + the in-app discard dialog
  components/
    ui/            shadcn-vue primitives — see the note under Testing
e2e/               Playwright specs + a test-only harness entry
```

State lives in one place. `createAperture()` composes the gallery, the rename
session and the guard; `mount.ts` provides it at the app level and every
component reaches it with `useAperture()`. `App.vue` takes no props and is
identical in production and under test — the entry point decides where folders
come from by passing a different `FolderSource`.

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

**Chrome cannot draw every format it will happily list.** There is no HEIC/HEIF decoder and no TIFF
decoder for `<img>` — and HEIC is what an iPhone camera roll is made of. Those files stay in the
gallery, because culling and renaming them is most of the point, but with `opacity` gated on `load`
and no `error` handler they render as blank white frames forever, which is indistinguishable from
the app being broken. `isPreviewable()` in `file-names.ts` is the list of formats to not even try;
`ImageTile`, `LargeView` and `FilmstripThumb` each pair it with an `@error` fallback for corrupt
files and formats nobody thought of. Any new surface that shows a photo needs both halves.

**The size slider must not keep focus.** Reka focuses the thumb on pointerdown, as it must to be
draggable; if it still holds focus on pointerup the arrow keys stay pointed at the slider and there
is no way back to the gallery but the mouse. `SizeSlider` blurs on `pointerup` only — never on
keydown — so Tab-ing to it still works. `useKeyboard` correspondingly ignores keys aimed at
`role="slider"`, or one arrow press would resize _and_ move the selection.

**`memory-adapter.ts` must never be reachable from `src/main.ts`.** It is the in-memory fake for
tests and the e2e harness, which has its own HTML entry; keeping it out of the production entry
graph is what keeps it out of the bundle. `grep MemoryAdapter dist/assets/*.js` should find nothing.

**Assets must go through Vite.** `base` is `/aperture/`, so a hardcoded leading-slash URL will 404
in production.

**Dialogs close themselves before your click handler runs.** Reka's `AlertDialogAction` dismisses
the dialog as part of handling the click, so any state you clear in the "dialog closed" path is gone
by the time the confirm handler looks for it — the confirm silently does nothing. Both dialogs
therefore track _whether they are open_ separately from _what they are about_
(`deleteDialogOpen` / `pendingDelete`, `guard.open` / `guard.pending`). Do not merge them back.

**A rename session stays open after applying**, with its button switched to Undo. That means the
draft is holding `ImageEntry` objects whose names no longer exist, so `apply()` re-materialises it
against the refreshed listing. Anything that keeps the session alive across a disk change has to do
the same.

**`columnCount()` reimplements a browser decision** — how many tracks `auto-fill` produces — and
arrow keys and drag hit-testing both trust it. `grid-geometry.browser.test.ts` checks it against
real layout across a matrix of widths and tile sizes. If you change the grid CSS, that test is what
tells you whether the maths still holds.

## Testing

There is **no `happy-dom` or `jsdom`**, on purpose. Most of this app's UI logic is geometry —
column counts, hit-testing a pointer to a grid cell, `IntersectionObserver`, `scrollIntoView` — and
a synthetic DOM has no layout engine, so `getBoundingClientRect()` returns zeros and those tests
would assert nothing. Two Vitest projects instead:

- **`unit`** (`*.test.ts`, node, no DOM): everything in `src/lib/` that is pure or takes a
  `FileSystemPort` argument. This is where the rename engine is covered, against `MemoryAdapter`.
- **`browser`** (`*.browser.test.ts`, real Chromium via Playwright): components whose behaviour
  depends on real layout, and anything reaching for a browser API node does not have —
  `useGallery.browser.test.ts` is there because `localStorage` is, and a hand-written stub would
  only prove the stub works.

Put a new test in `unit` unless it genuinely needs layout or a real browser API. If you find
yourself mocking `getBoundingClientRect`, it belongs in `browser`.

On top of those, `pnpm e2e` drives the whole app in Chromium through `e2e/harness.html`.

**On `components/ui/`:** these are shadcn-vue's output, and shadcn's model is that you own them —
customising is expected, not a smell. `Slider.vue` has one Aperture change: a `label` prop, because
`role="slider"` sits on the thumb and a plain `aria-label` on the component would land on the root
and leave the control unnamed. Mark any further edits the same way, so a future regeneration does
not quietly drop them.

## Deployment

Pushing to `main` builds and deploys to GitHub Pages. `main` is protected: PRs only, and `verify`
and `e2e` must be green to merge.

## Git Workflow

Use conventional branch names for all non-trivial work:

- `feat/<scope>-<short-description>`
- `fix/<scope>-<short-description>`
- `chore/<scope>-<short-description>`
- `docs/<scope>-<short-description>`
- `test/<scope>-<short-description>`
- `refactor/<scope>-<short-description>`

Use lowercase kebab-case for branch names. Keep them brief and specific.

Use Conventional Commits for every commit message:

- Format: `<type>(<optional-scope>): <description>`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `build`, `ci`, `perf`, `revert`
- Description: imperative mood, lowercase start, no trailing period

`itsjoshpark.github.io` carries the `joshuapark.dev` CNAME, so GitHub serves this project site under
that custom domain automatically. Nothing in the personal-site repo needs to change.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->
