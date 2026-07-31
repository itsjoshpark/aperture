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
- **Sequential rename** — start dragging a thumbnail and Aperture switches to rename mode. Arrange
  the images, set a prefix and/or suffix, and preview every new name before committing. One-click
  undo afterwards.

## Requirements

Chrome, Edge, Arc, or another Chromium browser. The File System Access API is not implemented in
Safari or Firefox, and Aperture cannot work without it.

## Development

```bash
pnpm install
pnpm dev
```

See [AGENTS.md](AGENTS.md) for the toolchain, project layout, and the filesystem constraints worth
knowing before changing anything.

## Licence

[MIT](LICENSE)
