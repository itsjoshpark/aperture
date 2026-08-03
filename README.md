# Aperture

A local image gallery in the browser. Point it at a folder on your machine, browse it Finder-style,
delete what you don't want, then drag the keepers into an order — Aperture rewrites the filenames to
match, sequentially.

**<https://joshuapark.dev/aperture>**

Nothing is uploaded anywhere. Aperture is a static page that talks to your disk through the
browser's File System Access API, so your photos never leave your machine.

## What it does

- **Gallery view** — an evenly spaced grid of framed thumbnails with a size slider, sorted by name
  or date modified.
- **Large view** — press `Space` for a full-size image with a filmstrip along the bottom.
- **Delete** — from the tile's trash icon or the `Delete` key. This is a permanent delete, not a
  move to the Trash.
- **Sequential rename** — start dragging a thumbnail (or press `Cmd`/`Ctrl` + `←`/`→`) and Aperture
  switches to rename mode. Arrange the images, set a prefix and/or suffix, and see every new name on
  its tile before you commit. Afterwards the Rename button becomes Undo, which puts every original
  name back.

## Keyboard

| Key                    | Grid                       | Large view            |
| ---------------------- | -------------------------- | --------------------- |
| `←` `→`                | move selection             | previous / next image |
| `↑` `↓`                | move a row                 | —                     |
| `Home` `End`           | first / last               | first / last          |
| `Space`                | open large view            | back to the grid      |
| `Delete`               | confirm, then delete       | confirm, then delete  |
| `Cmd`/`Ctrl` + `←` `→` | reorder the selected image | —                     |
| `Cmd`/`Ctrl` + `O`     | open a folder              | open a folder         |
| `Esc`                  | leave rename mode          | back to the grid      |

`Esc` never clears your selection. `Cmd`/`Ctrl` + `O` also works on the opening screen, before there
is a folder to browse.

## Requirements

Chrome, Edge, Arc, or another Chromium browser. The File System Access API is not implemented in
Safari or Firefox, and Aperture cannot work without it.

**HEIC and HEIF previews are decoded by Aperture itself.** No browser ships a HEIC decoder — the
format is covered by patent pools none of them license — and an iPhone camera roll is mostly HEIC, so
Aperture runs libheif in a background worker instead. Those tiles shimmer for a moment and then fill
in. The first one in a session also waits on a one-off download of the decoder. Nothing about the
files changes; this is only how they get on screen.

**TIFF files appear but cannot be previewed**, and their tiles say "No preview" instead. Sorting,
renaming and deleting them all work normally; only the picture is missing.

## Development

```bash
pnpm install
pnpm dev
```

See [AGENTS.md](AGENTS.md) for the toolchain, project layout, and the filesystem constraints worth
knowing before changing anything.

## Licence

[GPLv3](LICENSE)
