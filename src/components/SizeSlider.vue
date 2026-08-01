<script setup lang="ts">
import { ImageIcon } from "lucide-vue-next";
import { computed } from "vue";
import { Slider } from "@/components/ui/slider";
import { useAperture } from "@/composables/useAperture";
import { MAX_TILE_SIZE, MIN_TILE_SIZE } from "@/composables/useGallery";

const aperture = useAperture();

const value = computed({
  get: () => [aperture.gallery.tileSize.value],
  set: ([next]) => {
    if (next !== undefined) aperture.gallery.tileSize.value = next;
  },
});
</script>

<template>
  <div class="flex items-center gap-2">
    <ImageIcon class="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
    <Slider
      v-model="value"
      :min="MIN_TILE_SIZE"
      :max="MAX_TILE_SIZE"
      :step="8"
      class="w-32"
      label="Preview size"
    />
    <ImageIcon class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
  </div>
</template>
