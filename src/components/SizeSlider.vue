<script setup lang="ts">
import { Slider } from "@/components/ui/slider";
import { useAperture } from "@/composables/useAperture";
import { stopIndexFor } from "@/lib/grid-geometry";
import { ZoomIn, ZoomOut } from "lucide-vue-next";
import { computed, shallowRef } from "vue";

const aperture = useAperture();

const root = shallowRef<HTMLElement | null>(null);

/**
 * The slider moves between column counts, not pixels: the grid stretches its
 * tracks to fill the row, so most of a continuous range of sizes draws exactly
 * the same picture and the thumb slides through dead zones.
 *
 * The grid publishes its stops one resize-observer callback after this mounts;
 * until then the only size known to be drawable is the one already chosen.
 */
const stops = computed(() =>
  aperture.sizeStops.value.length > 0
    ? aperture.sizeStops.value
    : [aperture.gallery.tileSize.value],
);

const index = computed(() => stopIndexFor(stops.value, aperture.gallery.tileSize.value));

const value = computed({
  get: () => [index.value],
  set: ([next]) => {
    const size = next === undefined ? undefined : stops.value[next];
    if (size !== undefined) aperture.gallery.tileSize.value = size;
  },
});

// The slider's own value is a position in that list, which says nothing out
// loud; announce the size it stands for.
const valueText = computed(() => `${stops.value[index.value]} pixels`);

/**
 * Reka focuses the thumb on pointerdown, which is right for a control you are
 * about to drag and wrong the moment you let go: the arrow keys belong to the
 * gallery, and having resized once you have no way back to them but the mouse.
 *
 * Handing focus back on `pointerup` — never on keydown — leaves the slider fully
 * usable from the keyboard for anyone who reached it with Tab.
 */
function releaseFocus(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement && root.value?.contains(active)) active.blur();
}
</script>

<template>
  <div
    ref="root"
    class="flex items-center gap-2"
    @pointerup="releaseFocus"
    @pointercancel="releaseFocus"
  >
    <ZoomOut class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    <Slider
      v-model="value"
      :min="0"
      :max="stops.length - 1"
      :step="1"
      class="w-32"
      label="Preview size"
      :value-text="valueText"
    />
    <ZoomIn class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  </div>
</template>
