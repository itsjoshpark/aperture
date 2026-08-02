<script setup lang="ts">
import { Slider } from "@/components/ui/slider";
import { useAperture } from "@/composables/useAperture";
import { MAX_TILE_SIZE, MIN_TILE_SIZE } from "@/composables/useGallery";
import { ZoomIn, ZoomOut } from "lucide-vue-next";
import { computed, shallowRef } from "vue";

const aperture = useAperture();

const root = shallowRef<HTMLElement | null>(null);

const value = computed({
  get: () => [aperture.gallery.tileSize.value],
  set: ([next]) => {
    if (next !== undefined) aperture.gallery.tileSize.value = next;
  },
});

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
      :min="MIN_TILE_SIZE"
      :max="MAX_TILE_SIZE"
      :step="8"
      class="w-32"
      label="Preview size"
    />
    <ZoomIn class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  </div>
</template>
