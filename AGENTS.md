# Aperture

A local image gallery in the browser. Point it at a folder, browse it Finder-style, delete what you
don't want, drag the keepers into an order — Aperture rewrites the filenames to match that order.

Static SPA, deployed to <https://joshuapark.dev/aperture>.

## Commands

pnpm (pinned via `packageManager`), driving **Vite+** — the `vp` CLI wrapping Vite, Vitest, Oxlint,
Oxfmt and Rolldown.

| Command      | What it does                                   |
| ------------ | ---------------------------------------------- |
| `pnpm dev`   | dev server                                     |
| `pnpm check` | format + lint + typecheck (`--fix` to autofix) |
| `pnpm test`  | both Vitest projects (see Testing)             |
| `pnpm build` | `vue-tsc -b` then production build             |
| `pnpm e2e`   | Playwright smoke suite                         |

Plus two that run against `dist`, so `pnpm build` has to come first: `pnpm check:bundle` for the
invariants under Build, and `pnpm e2e:production` for the built app over `vp preview`. Coverage is
`pnpm test run --coverage` — reported, never gated.

`.vite-hooks/pre-commit` runs `vp check --fix` on staged files. The scripts are thin wrappers, so if
`vp` misbehaves (it is at 0.2.x) swap their bodies for `vite` / `vitest` / `oxlint` — no application
code depends on Vite+.

## Layout

```
src/
  main.ts          production entry: real disk
  mount.ts         builds the app around an Aperture instance
  lib/
    fs/            the ONLY code that touches disk
      types.ts            FileSystemPort — the seam everything else is written against
      fsa-adapter.ts      File System Access implementation
      memory-adapter.ts   in-memory fake (tests + harness only)
      fixtures.ts         real PNG/JPEG/HEIC bytes (tests + harness only)
      folder-source.ts    where folders come from; swapped by the harness
    naming.ts        PURE: filename planning + validation
    rename-engine.ts executes a plan against a FileSystemPort
    exif.ts          PURE (bar one Blob read): the date a photo was taken
    sort.ts          natural-name + date comparators
    grid-geometry.ts PURE: width/gap -> columns + size stops, index<->cell, hit-test
    tile-flip.ts     the FLIP the tiles resize and reorder under (measures the DOM)
    preview/         turning a file into something an <img> can show
      renderer.ts         plain object URL, or the HEIC decoder
      heic-decoder.ts     worker pool + queue in front of libheif
      heic-worker.ts      the only import of `heic-decode`; decode -> resize -> JPEG
      protocol.ts         worker message types, importable without libheif
      preview-format.ts   size and quality of a decoded preview
    thumbnails.ts    object-URL LRU cache, capped by count and by bytes
    file-names.ts    PURE: base/extension, recognise images, flag undrawable ones
  composables/
    useAperture.ts       the store; provided at app level, injected everywhere
    useGallery.ts        entries, sort, selection, delete
    useRenameSession.ts  draft order, affixes, apply/undo
    useTileDrag.ts       Pointer Events drag-reorder, no library
    useKeyboard.ts       the whole key map
    useUnsavedGuard.ts   beforeunload + the in-app discard dialog
  components/ui/   shadcn-vue primitives — see the note under Testing
e2e/               Playwright specs + a test-only harness entry
```

State lives in one place: `createAperture()` composes the gallery, the rename session and the guard,
`mount.ts` provides it at app level, every component reaches it with `useAperture()`. `App.vue` takes
no props and is identical in production and under test — the entry point decides where folders come
from by passing a different `FolderSource`.

## Things that will bite you

### Disk, deleting, renaming

**The File System Access API is Chromium-only.** Safari and Firefox get `UnsupportedBrowser.vue`.
There is deliberately no demo mode.

**You cannot rename a local file directly.** `move()` ships only for OPFS; elsewhere it is behind a
Chrome flag, so `fsa-adapter.ts` falls back to copy-then-delete. Consequence: **renaming resets
date-modified**, though contents and EXIF are untouched. The UI says so; keep it saying so.

**Deleting is permanent.** `removeEntry()` does not use the Trash. Dialog copy must never imply it
does.

**Renaming must be two-phase.** A naive in-order rename destroys data whenever a target name is held
by another file in the set (`b.jpg → 1.jpg` while `1.jpg` exists). Every file goes to a
`.aperture-tmp-*` name first, then to its target. Do not "optimise" this away.

**Nothing is remembered between sessions, deliberately.** A directory handle survives a reload but
its permission does not, and `requestPermission()` only works inside a user gesture — so restoring a
folder still costs a click and a prompt, which is not enough better than picking it again to justify
keeping handles in IndexedDB. `FileSystemPort.ensurePermission()` exists for adapters that need it,
but nothing calls it: `showDirectoryPicker()` asks for `readwrite` up front.

**Applying a rename ends the session.** The files are on disk and there is nothing left to arrange,
so the bar closes, the size slider comes back, and what happened is said in `MessageBanner` —
`gallery.notice`, held apart from `gallery.error` so a failure is never papered over by the next
success. Applying also sets the sort to name-ascending: the grid goes back to showing the sort
rather than the draft, and since the rename numbered the files in the arranged order, name order
_is_ that arrangement. Under any other sort the photos would jump out of the order they were just
put in. The undo record outlives the session, on the toolbar.

**The folder's name list has exactly one owner.** `gallery.allNames` — every name in the folder,
images or not — is what rename mode checks targets against, and a session outlives changes to the
folder. Copying it into the session at `begin()` meant deleting a file left the bar refusing a name
nothing held any more, with no way out but restarting. Any operation that changes folder contents
must update `allNames`, the way `removeMany()` and `refresh()` do.

### Dates

**Date-modified is destroyed by the app's own main feature.** `copyThenDelete` rewrites the bytes, so
every rename resets it. EXIF travels with the contents, which is why `lib/exif.ts` exists and why
"Date taken" is the sort that still means something afterwards.

**`DateTaken` keeps a wall clock as well as an epoch, and both are load-bearing.** `epoch` orders;
`wallClock` is the time the camera recorded, which is what a filename built from a date has to say.
Deriving one from the other runs it through the _viewer's_ timezone — an hour out at home, a day out
for a photo taken abroad. This is the bug `exifr` ships by default.

**A file with no date taken sorts by its modified date.** Screenshots and downloads have no EXIF at
all, and there are usually a few in any real folder. Anything else that reads `dateTaken` should fall
back the same way rather than inventing a second answer.

**Reading EXIF costs a 64 KB read per file**, paid concurrently while a folder opens — about 0.23 ms
per file, so a thousand photos is a fifth of a second. `readDatesTaken` caps how many are in flight;
removing the cap trades that for thrashing the disk.

**HEIC may need a second read, and the parser will ask for one.** EXIF is an item placed by `iloc` at
an absolute offset that can sit anywhere in the file, so `locateExif` returns either a position or a
range to go and fetch. Real Apple files land inside the prefix; do not conclude from that that the
second read is dead code.

### Previews

**Chrome cannot draw every format it will happily list**, and an empty photo frame is
indistinguishable from a broken app. **Any new surface showing a photo needs all three** guards:

- `isPreviewable()` in `file-names.ts` — the denylist (`.tif`/`.tiff` only); render "No preview"
  instead of an `<img>`.
- An `@error` handler on the `<img>` — it is a denylist, so corrupt files and formats nobody thought
  of are attempted and land here.
- `try`/`catch` around `cache.acquire()`, plus a pending state — `acquire()` rejects on a HEIC
  libheif will not read, and an unhandled rejection leaves the frame blank forever.

**HEIC is decoded by us, not by Chrome.** No browser licenses HEVC, so `lib/preview/` runs libheif in
a worker pool: decode, downscale to 2048px, re-encode as JPEG. At ~600ms of CPU and 46 MB of
transient RGBA per 12 MP photo it has to be queued, cancellable and off the main thread — hence the
shimmer while a tile waits. `heic-decode` is imported from `heic-worker.ts` and nowhere else; on the
main thread it puts a megabyte of wasm in the entry chunk.

**`heic-decode` must stay in `optimizeDeps.include`.** It is 1.5 MB of CommonJS with wasm inlined as
base64; without pre-bundling, the first HEIC after a cold `pnpm dev` blocks for over a minute against
84ms with it. Dev-server trap only — production builds are unaffected.

**`ThumbnailCache` is capped twice.** A pass-through object URL is a handle onto a file and costs no
memory; a decoded HEIC preview is a JPEG we are holding. Renderers report `bytes` so the byte budget
evicts the second kind without punishing the first. Pair every `acquire()` with exactly one
`release()` — including when it rejects, and when you give up before it settles, which is what
cancels a decode nobody is waiting for.

**A filename does not identify a photograph.** Renumbering a folder that Aperture has already
numbered is a permutation: every name in it survives the rename with a different photo behind it. A
surface that decides it is showing the right file by comparing names therefore misses the change
entirely — and because the grid keys tiles on the name too, Vue reuses the very components that
would have re-read on mount, so the whole grid redraws itself as it was while the disk is correct.
Compare the `ImageEntry`, which a listing mints afresh every time: that is why `ImageTile`,
`FilmstripThumb` and `LargeView` all track the entry they acquired rather than its name, and why
`refresh()` — not its callers — drops the thumbnail cache.

### Grid, input, dialogs

**The size slider must not keep focus.** Reka focuses the thumb on pointerdown, as it must to be
draggable; if it still holds focus on pointerup the arrow keys stay aimed at the slider and only the
mouse gets you back to the gallery. `SizeSlider` blurs on `pointerup` only — never on keydown, so
Tab-ing to it still works — and `useKeyboard` ignores keys aimed at `role="slider"`, or one arrow
press would resize _and_ move the selection.

**The size slider moves between column counts, not pixels.** `minmax(tile, 1fr)` stretches the tracks
to fill the row, so the picture changes only when the column count does, and a slider measured in
pixels spends most of its travel redrawing the same thing. `tileSizeStops` derives one size per
achievable count — each the width that count's tracks are really given — and `SizeSlider` is an index
into that list. So `MIN`/`MAX_TILE_SIZE` bound the tile as _drawn_, not the `minmax()` floor asking
for it: a 480px floor draws as 632px wherever the width leaves room for two columns. The stops depend
on the container width, so `GalleryGrid` publishes them alongside `columns` from its resize observer.

**`TransitionGroup`'s move transition does not fire, so the grid FLIPs itself.** `.tile-move` is
defined and the class resolves against a cell — but Vue never applies it, on a re-sort or a resize or
a drag, and the tiles jump. `tile-flip.ts` measures every card before the change and animates the
difference away after, which a move transition could not have done for the resize in any case: a FLIP
only translates, and half of that one is the tiles changing size. Three things it is easy to undo:

- **The card moves, never the cell.** The cell is the grid track and is already where the grid wants
  it, which is also what leaves it free to be the drop placeholder.
- **The lifted card is skipped at animate time, not at capture time** — while a drag is running the
  cursor owns it, but the moment the button comes up that same measurement is what settles it into
  its cell. `GalleryGrid` watches `drag.dragging` for exactly that, before the release reaches the
  DOM.
- **The scroller is `overflow-x-hidden`.** A transform counts towards scrollable overflow, and cards
  mid-shrink are wider than the cells they are shrinking into.

**A drag always carries a run, and one tile is a run of one.** There is no single-tile path beside
the block path: `onBegin` says how many are coming and where the pressed tile sits inside them,
`useTileDrag` owns the run from there — it does the one clamp (`startFor`), calls `onMove(start)` in
run coordinates, and answers `carries(index)` for the tiles travelling beside the cursor. The grid
only turns a start index into `gatherRun`. Two things follow. The first `onMove` is unconditional,
because a selection with gaps in it needs collecting even when that leaves the run beginning exactly
where the pressed tile already is. And keeping the run contiguous from then on is what lets `hitTest`
go on answering with a single cell.

**`Cmd`/`Ctrl` + `O` sits above the rest of the key map, deliberately.** `useKeyboard` returns early
when there is no folder, so inside the `switch` the chord would work only once a folder was already
open — the half that matters least. It also precedes `handlesItsOwnKeys`, since unlike the arrows it
means nothing in a text field. And nothing may be awaited before `openFolder()`:
`showDirectoryPicker()` needs the user activation the keydown carries, so `openFolder` →
`guard.attempt` → `source.open()` has to stay synchronous.

**Dialogs close themselves before your click handler runs.** Reka's `AlertDialogAction` dismisses the
dialog as part of handling the click, so state cleared in the "dialog closed" path is already gone
when the confirm handler looks for it, and the confirm silently does nothing. Both dialogs track
_whether they are open_ separately from _what they are about_ (`deleteDialogOpen` / `pendingDeletes`,
`guard.open` / `guard.pending`). Do not merge them back.

**A tile's `<img>` is the photograph, not the square it sits in.** The square — `aspect-square` on the
frame — is what lines a row up, and every photo is centred inside it in a box sized from the image's
own ratio, so the `<img>` box _is_ the picture as drawn. Two things read that: the selection border,
which traces the photo rather than the letterboxing beside it, and `getTileRect`, which hands the
rect to `useLargeViewTransition` as the origin the large view zooms out of. Putting `size-full` back
on the `<img>` restores the square and breaks both — the border boxes in empty space, and the zoom
starts at the wrong width for every photo that is taller than it is wide. Nothing outside
`ImageTile.browser.test.ts` fails when it does.

**The photograph is also the only thing a click selects, and one handler decides that.** Every click
in the grid reaches `GalleryGrid.onGridClick`, which asks one question: did it land inside a
`data-select-target` — the photo box or the caption — or on background? Background is the
letterboxing, the gaps, the padding and everything below the last row, and background clears the
selection. Tiles do not handle their own clicks; they only mark which of their parts is the
photograph, so adding a selectable region is one attribute and no second step. Two consequences worth
keeping: widening the hit target back to the square removes the only place left to click to deselect,
and overlays drawn over the photo box (the decode shimmer, the "No preview" fallback) must stay
`pointer-events-none`, or they swallow the click for exactly the tiles that have no `<img>` to aim at.

**A pointerup that ends a drag still fires a `click`**, retargeted by the pointer capture onto the
cell — which is not a select target, so the grid would read it as background and clear the selection
you just dragged. `useTileDrag` raises `justDropped()` for one turn of the event loop and the grid's
click handler consults it. Scoped rather than swallowed globally: suppressing the click everywhere
would eat it for the toolbar and any future drop target too.

**The selection is a set, a cursor and an anchor, written only by `setSelection`.** The cursor is what
every single-photo surface means by "selected" (large view, filmstrip, `getTileRect`); the anchor is
where a `Shift` range starts and is held apart from the cursor, so each range is redrawn from the same
place instead of extending from the last one. The invariant the single writer exists to keep: the
cursor and the anchor are members of the set, or the set is empty and both are null. The cursor ships
as `cursorName`, deliberately not a near-homonym of `selectedNames` — a surface that wants "the
selected photo" and grabs the wrong one would silently act on one arbitrary member of a selection.

**`gatherRun` moves a selection; nothing moves a single index.** It lifts entries out of the list
wherever they are scattered and puts them back as one block, so the drag, the `Cmd`+arrow nudge and
the initial gather are one operation with one set of edge cases. `useAperture.nudgeSelection` is where
the keyboard's version lives — a key map should not be doing index arithmetic against layout maths.

**Nothing a drag draws may be card-shaped.** The card is always a square and photographs are every
shape, so a surface on the card is a dark rectangle around a picture that does not fill it. The lifted
tile therefore has no background and no shadow of its own: the shadow is cast by the photo's box, the
dashed drop placeholder rebuilds the same square-then-photo-box to trace the photograph, and each
caption line takes an `inline-block` backing sized to the text. That last one carries a trap —
text decoration does not cross into an atomic inline box, so `line-through` sits on the span rather
than the `<p>`, or a lifted rename preview quietly stops striking out the old name.

**A dragged tile never leaves its cell.** `ImageTile`'s root is the grid cell and stays put — it is
what hosts the drop placeholder — while a card _inside_ it carries the transform following the cursor,
and `useTileDrag` measures the root for that offset. Moving the transform onto the root brings back
the correction term the old code needed and leaves no cell to draw the placeholder in. The root also
gets `transition: none` while dragging, or `TransitionGroup` FLIPs the placeholder over 260ms and the
card drifts under the cursor for the whole animation.

**Auto-scroll must not read `scrollHeight`.** The lifted card's transform still counts towards
scrollable overflow, so scrolling towards it creates more of it — a loop that runs off the last row
into blank space. `useTileDrag` clamps to `contentHeight()`, the grid's laid-out height, which no
transform can change. `gallery.spec.ts` holds a drag at the bottom edge to prove it.

**`columnCount()` reimplements a browser decision** — how many tracks `auto-fill` produces — and
arrow keys and drag hit-testing both trust it. `grid-geometry.browser.test.ts` checks it against real
layout across a matrix of widths and tile sizes; if you change the grid CSS, that test tells you
whether the maths still holds.

### Build

**`memory-adapter.ts` and `fixtures.ts` must never be reachable from `src/main.ts`.** The e2e harness
has its own HTML entry; keeping the fake out of the production entry graph is what keeps it out of
the bundle. `pnpm check:bundle` enforces this, by walking the imports out of `src/main.ts` rather
than by reading the output — **do not check this by grepping `dist`**. Minification renames exported
class names, so `grep MemoryAdapter dist/assets/*.js` finds nothing with the whole module sitting in
the chunk: a check that reports success for the one thing it exists to catch.

**Assets must go through Vite.** `base` is `/aperture/`, so a hardcoded leading-slash URL 404s in
production. Vite rewrites the attributes in `index.html` itself, so what is left to get wrong is a
URL built at runtime — `pnpm e2e:production` catches those by loading the built app over
`vp preview` and asserting nothing 404s. That suite is also the only thing that ever runs the
production bundle: `pnpm e2e` needs the harness, which is not a build input.

## Testing

There is **no `happy-dom` or `jsdom`**, on purpose: most of this app's UI logic is geometry, and a
synthetic DOM has no layout engine, so `getBoundingClientRect()` returns zeros and those tests would
assert nothing. Two Vitest projects instead:

- **`unit`** (`*.test.ts`, node, no DOM): everything in `src/lib/` that is pure or takes a
  `FileSystemPort`. The rename engine is covered here, against `MemoryAdapter`.
- **`browser`** (`*.browser.test.ts`, real Chromium via Playwright): anything depending on real
  layout, or on a browser API node lacks — `useGallery.browser.test.ts` is there because
  `localStorage` is, and a hand-written stub would only prove the stub works.

**Every composable is a `browser` test, and not by preference.** `useUnsavedGuard` hands `window`
straight to `useEventListener`, so `createAperture()` is a `ReferenceError` under node before any
assertion runs — which puts `useAperture`, `useKeyboard` and anything else built on the store in the
browser project whatever they are testing.

Put a new test in `unit` unless it genuinely needs layout or a real browser API; if you find yourself
mocking `getBoundingClientRect`, it belongs in `browser`. On top of both, `pnpm e2e` drives the whole
app in Chromium through `e2e/harness.html`.

**On `components/ui/`:** shadcn-vue's output, which you are meant to own — customising is expected,
not a smell. `Slider.vue` has one Aperture change: a `label` prop, because `role="slider"` sits on
the thumb and a plain `aria-label` would land on the root and leave the control unnamed. Mark further
edits the same way, so a regeneration does not quietly drop them.

## Comments

A comment earns its place by saying something the code cannot. Nearly every constraint in this file
is invisible at the call site that depends on it — that is the bar.

- **Short.** A line or two; three when the reason genuinely needs it. Anything longer is a section of
  this file, not a comment.
- **Only for what is not obvious from reading the code.** Explain why the strange thing is strange —
  why the rename is two-phase, why the root gets `transition: none`, why scroll happens before
  measure. If the next line already tells the reader, delete the comment.
- **No syntax narration.** `// loop over the entries` adds nothing to the `for` beneath it, and
  `// set the flag` adds nothing to the assignment.
- **No lore.** No PR or issue numbers, no review feedback, no names, no dates, no "kept for X". Git
  history holds that, and unlike the comment it stays accurate. Same for `TODO(name)`.

## Deployment

Pushing to `main` builds and deploys to GitHub Pages. `main` is protected: PRs only, `verify` and
`e2e` green to merge. `itsjoshpark.github.io` carries the `joshuapark.dev` CNAME, so this project
site is served under the custom domain automatically — nothing in the personal-site repo changes.

## Git Workflow

Branches for all non-trivial work: `<type>/<scope>-<short-description>`, lowercase kebab-case, brief
and specific. Commits: Conventional Commits, `<type>(<optional-scope>): <description>`, imperative
mood, lowercase start, no trailing period. Types for both: `feat`, `fix`, `docs`, `style`,
`refactor`, `test`, `chore`, `build`, `ci`, `perf`, `revert`.

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
