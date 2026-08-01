<script setup lang="ts">
import { useResizeObserver } from "@vueuse/core";
import { computed, nextTick, ref, shallowRef, watch } from "vue";
import { useAperture } from "@/composables/useAperture";
import { useTileDrag } from "@/composables/useTileDrag";
import { cellWidthFor, columnCount, type GridMetrics } from "@/lib/grid-geometry";
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

const metrics = (): GridMetrics => {
  const columns = aperture.columns.value;
  const first = grid.value?.firstElementChild as HTMLElement | null;
  return {
    columns,
    cellWidth: cellWidthFor(width.value, columns, GAP),
    // Measured rather than derived: the tile's height depends on its footer,
    // the font, and the tile size, and guessing it makes drops land one row off.
    cellHeight: first?.getBoundingClientRect().height ?? gallery.tileSize.value,
    gap: GAP,
  };
};

const drag = useTileDrag({
  scroller: () => scroller.value,
  count: () => aperture.displayed.value.length,
  metrics,
  gridOrigin: () => {
    const rect = grid.value?.getBoundingClientRect();
    return { x: rect?.left ?? 0, y: rect?.top ?? 0 };
  },
  onBegin: async (index) => {
    // Dragging a tile *is* how you enter rename mode.
    if (!rename.active.value) await aperture.enterRename();
    const entry = aperture.displayed.value[index];
    if (entry) gallery.select(entry.name);
    await nextTick();
  },
  onMove: (from, to) => rename.move(from, to),
  onCancel: () => rename.cancel(),
});

const previewNames = computed(() => {
  if (!rename.active.value) return null;
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

/** Where a tile is on screen, for the large view's open/close animation. */
function getTileRect(name: string): DOMRect | null {
  const image = tiles.get(name)?.el?.querySelector("img");
  return image?.getBoundingClientRect() ?? null;
}

// Keep the selection on screen as it moves, whether by arrow key or by sort.
watch(
  () => gallery.selectedName.value,
  async (name) => {
    if (!name || drag.isDragging()) return;
    await nextTick();
    tiles.get(name)?.scrollIntoView({ block: "nearest" });
  },
);

defineExpose({ scroller, getTileRect });
</script>

<template>
  <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
    <TransitionGroup
      ref="gridRoot"
      tag="div"
      name="tile"
      role="grid"
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
        :selected="entry.name === gallery.selectedName.value"
        :preview-name="previewNames?.get(entry.name)"
        :removing="entry.name === gallery.removingName.value"
        :dragging="index === drag.draggingIndex.value && drag.isDragging()"
        :translate="drag.translate.value"
        :draggable="rename.active.value"
        @select="gallery.select(entry.name)"
        @activate="aperture.openLargeView()"
        @remove="aperture.askToDelete(entry)"
        @drag-start="drag.onPointerDown($event, index)"
      />
    </TransitionGroup>
  </div>
</template>

<style scoped>
/*
 * Vue's TransitionGroup applies FLIP transforms to the `move` class, which means
 * one rule animates every layout change the grid can undergo: reordering during
 * a drag, re-sorting, resizing tiles, and closing the gap left by a deleted
 * file. Nothing here is per-case.
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
 * the survivors can take the space. Leaving it out of the flow here instead
 * would fight the grid's auto-placement.
 */
.tile-leave-active {
  transition: opacity var(--motion-fast) var(--motion-ease);
}

.tile-leave-to {
  opacity: 0;
}
</style>
