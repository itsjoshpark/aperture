<script setup lang="ts">
import { useResizeObserver } from "@vueuse/core";
import { computed, nextTick, ref, shallowRef, watch } from "vue";
import { useAperture } from "@/composables/useAperture";
import { useTileDrag } from "@/composables/useTileDrag";
import { MAX_TILE_SIZE, MIN_TILE_SIZE } from "@/composables/useGallery";
import type { ImageEntry } from "@/lib/fs/types";
import { cellWidthFor, columnCount, type GridMetrics, tileSizeStops } from "@/lib/grid-geometry";
import { captureTiles, flipTiles, TILE_FLIP_DURATION } from "@/lib/tile-flip";
import ImageTile from "./ImageTile.vue";

const aperture = useAperture();
const { gallery, rename } = aperture;

/** Matches `gap-4` below. Kept in JS because the geometry maths needs the number. */
const GAP = 16;

const scroller = shallowRef<HTMLElement | null>(null);
// TransitionGroup renders a component, so the template ref hands back an
// instance rather than the element we need to measure.
const gridRoot = shallowRef<{ $el: HTMLElement } | null>(null);
const grid = computed(() => gridRoot.value?.$el ?? null);
const width = ref(0);

useResizeObserver(grid, ([entry]) => {
  width.value = entry?.contentRect.width ?? 0;
});

// The browser decides the column count from `auto-fill`; we reproduce that
// decision so arrow keys and drag hit-testing agree with what is on screen.
watch(
  [width, gallery.tileSize],
  () => {
    aperture.columns.value = columnCount(width.value, gallery.tileSize.value, GAP);
  },
  { immediate: true },
);

// Which sizes are worth offering depends on the width alone, not on the size
// currently chosen.
watch(
  width,
  () => {
    aperture.sizeStops.value = tileSizeStops(width.value, GAP, MIN_TILE_SIZE, MAX_TILE_SIZE);
  },
  { immediate: true },
);

/** Measure, let the change land, then animate the difference away. */
async function flipThrough(change?: () => void): Promise<void> {
  const before = captureTiles(grid.value, scroller.value);
  change?.();
  await nextTick();
  flipTiles(before, aperture.motion.duration(TILE_FLIP_DURATION));
}

// No change to make here: the watcher already runs before the DOM has taken the
// new size, which is the only moment the old one can be measured.
watch(gallery.tileSize, () => void flipThrough());

// Photos leaving the grid is the one list change nothing else animates: the
// slider and the drag call `flipThrough` themselves, and a re-sort or an applied
// rename hands back the same number of tiles. Pre-flush like the size watcher,
// so this still measures the DOM the old list rendered.
watch(
  () => aperture.displayed.value,
  (after, before) => {
    if (after.length < before.length) void flipThrough();
  },
);

const metrics = (): GridMetrics => {
  const columns = aperture.columns.value;
  const first = grid.value?.firstElementChild as HTMLElement | null;
  return {
    columns,
    cellWidth: cellWidthFor(width.value, columns, GAP, gallery.tileSize.value),
    // Measured rather than derived: the tile's height depends on its footer,
    // the font, and the tile size, and guessing it makes drops land one row off.
    cellHeight: first?.getBoundingClientRect().height ?? gallery.tileSize.value,
    gap: GAP,
  };
};

/**
 * The photos a drag is carrying, in the order they will land. One tile is a run
 * of one, so nothing below has a single-tile case beside the block case.
 */
const carried = shallowRef<ImageEntry[]>([]);

const drag = useTileDrag({
  scroller: () => scroller.value,
  contentHeight: () => grid.value?.offsetHeight ?? 0,
  count: () => aperture.displayed.value.length,
  metrics,
  gridOrigin: () => {
    const rect = grid.value?.getBoundingClientRect();
    return { x: rect?.left ?? 0, y: rect?.top ?? 0 };
  },
  onBegin: async (index) => {
    // Dragging a tile *is* how you enter rename mode.
    if (!rename.active.value) aperture.enterRename();

    const pressed = aperture.displayed.value[index];
    if (!pressed) return;

    // Pressing a photo outside the selection drags that photo alone, the way
    // Finder does — the selection you had was about something else.
    if (!gallery.selectedNames.value.has(pressed.name)) gallery.select(pressed.name);
    carried.value = aperture.selectedEntries.value;

    await nextTick();
    return { size: carried.value.length, offset: carried.value.indexOf(pressed) };
  },
  // The tiles the run displaces slide out of its way; the lifted card itself is
  // under the cursor and is left alone. The first call gathers a scattered
  // selection into one block, which is why they visibly close up.
  onMove: (start) => void flipThrough(() => rename.moveRun(carried.value, start)),
  onCancel: () => rename.cancel(),
});

// Dropping a tile lands it wherever the cursor left it, which is not where its
// cell is. This watcher runs before the release reaches the DOM, so the card is
// still lifted when it is measured and settled by the time it is animated.
watch(drag.dragging, (lifted) => {
  if (lifted) return;
  carried.value = [];
  void flipThrough();
});

/**
 * Old name -> new name, for the per-tile preview. Null once the rename has been
 * applied: at that point the names on the tiles are the real ones, and showing
 * them struck through against themselves would be nonsense.
 */
const previewNames = computed(() => {
  if (!rename.active.value || rename.applied.value) return null;
  return new Map(rename.plan.value.steps.map((step) => [step.from, step.to]));
});

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(auto-fill, minmax(${gallery.tileSize.value}px, 1fr))`,
}));

/**
 * Tiles keyed by filename rather than collected into an index-ordered array:
 * the array form depends on Vue's traversal order matching the render order,
 * which is exactly the assumption a reorder breaks.
 */
interface TileHandle {
  el: HTMLElement | null;
  scrollIntoView: (options?: ScrollIntoViewOptions) => void;
}

const tiles = new Map<string, TileHandle>();

function registerTile(name: string, instance: unknown): void {
  if (instance) tiles.set(name, instance as TileHandle);
  else tiles.delete(name);
}

/**
 * Every click in the grid arrives here, and one rule sorts them: it either
 * landed on something that marks itself selectable — a photograph or its
 * caption — or it landed on background, which is the gaps, the padding, the
 * letterboxing beside a tall photo, and everything below the last row.
 *
 * Delegated rather than handled per tile so there is one place that knows the
 * rule; the tiles only have to declare which of their parts is the photograph.
 */
function onGridClick(event: MouseEvent): void {
  // The pointerup that ends a drag fires a click too, retargeted by the pointer
  // capture onto the cell — which is not a select target, and would clear the
  // selection you just dragged.
  if (drag.justDropped()) return;

  const target = (event.target as HTMLElement | null)?.closest("[data-select-target]");
  const name = target?.closest<HTMLElement>("[data-name]")?.dataset.name;
  if (name === undefined) {
    gallery.clearSelection();
    return;
  }

  // The standard three: plain click replaces, `Cmd`/`Ctrl` toggles, `Shift` ranges.
  const list = aperture.displayed.value;
  if (event.metaKey || event.ctrlKey) gallery.toggle(name, list);
  else if (event.shiftKey) gallery.extendTo(name, list);
  else gallery.select(name);
}

/** Where a tile is on screen, for the large view's open/close animation. */
function getTileRect(name: string): DOMRect | null {
  const image = tiles.get(name)?.el?.querySelector("img");
  return image?.getBoundingClientRect() ?? null;
}

// Keep the selection on screen as it moves, whether by arrow key or by sort.
watch(
  () => gallery.cursorName.value,
  async (name) => {
    if (!name || drag.dragging.value) return;
    await nextTick();
    tiles.get(name)?.scrollIntoView({ block: "nearest" });
  },
);

defineExpose({ scroller, getTileRect });
</script>

<template>
  <!--
    `overflow-x-hidden` because a transform counts towards scrollable overflow:
    zooming out starts the right-hand cards wider than the cells they are
    shrinking into, and a horizontal scrollbar that appears for 260ms and then
    leaves takes the whole grid with it, twice.
  -->
  <div
    ref="scroller"
    class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
    @click="onGridClick"
  >
    <TransitionGroup
      ref="gridRoot"
      tag="div"
      name="tile"
      role="grid"
      aria-multiselectable="true"
      :aria-label="`${gallery.label.value} — ${aperture.displayed.value.length} images`"
      class="grid gap-4 p-4"
      :style="gridStyle"
    >
      <ImageTile
        v-for="(entry, index) in aperture.displayed.value"
        :key="entry.name"
        :ref="(instance) => registerTile(entry.name, instance)"
        :entry="entry"
        :cache="gallery.thumbnails"
        :selected="gallery.selectedNames.value.has(entry.name)"
        :cursor="entry.name === gallery.cursorName.value"
        :preview-name="previewNames?.get(entry.name)"
        :removing="gallery.removingNames.value.has(entry.name)"
        :dragging="index === drag.draggingIndex.value && drag.dragging.value"
        :carried="drag.carries(index)"
        :carry-count="carried.length"
        :translate="drag.translate.value"
        :draggable="rename.active.value"
        @activate="aperture.openLargeView()"
        @drag-start="drag.onPointerDown($event, index)"
      />
    </TransitionGroup>
  </div>
</template>

<style scoped>
/*
 * Vue's TransitionGroup is supposed to FLIP the cells under this class whenever
 * the grid relays. In practice it does not fire — not on a re-sort, not on a
 * resize, not on a drag, not on a delete — which is why `tile-flip.ts` measures
 * and animates the tiles itself.
 */
.tile-move {
  transition: transform var(--motion-slow) var(--motion-ease);
}

.tile-enter-active {
  transition:
    opacity var(--motion-base) var(--motion-ease),
    transform var(--motion-base) var(--motion-ease);
}

.tile-enter-from {
  opacity: 0;
  transform: scale(0.94);
}

/*
 * Deletion is animated by `ImageTile` shrinking in place *before* the entry
 * leaves the array — so by the time this runs the tile is already invisible and
 * the survivors can take the space, which they do under the FLIP the watcher
 * above starts. Leaving it out of the flow here instead would fight the grid's
 * auto-placement.
 */
.tile-leave-active {
  transition: opacity var(--motion-fast) var(--motion-ease);
}

.tile-leave-to {
  opacity: 0;
}
</style>
