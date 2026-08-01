<script setup lang="ts">
import { nextTick, watch } from "vue";
import { useAperture } from "@/composables/useAperture";
import { cn } from "@/lib/utils";
import FilmstripThumb from "./FilmstripThumb.vue";

const aperture = useAperture();
const { gallery } = aperture;

const thumbs = new Map<string, HTMLElement>();

function register(name: string, el: unknown): void {
  if (el instanceof HTMLElement) thumbs.set(name, el);
  else thumbs.delete(name);
}

// Keep the current image centred as you move through the strip.
watch(
  () => gallery.selectedName.value,
  async (name) => {
    if (!name) return;
    await nextTick();
    thumbs.get(name)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  },
  { immediate: true },
);
</script>

<template>
  <div
    class="flex shrink-0 gap-2 overflow-x-auto border-t border-white/10 bg-[#2d2d2d]/40 p-2"
    role="listbox"
    aria-label="Images in this folder"
  >
    <button
      v-for="entry in aperture.displayed.value"
      :key="entry.name"
      :ref="(el) => register(entry.name, el)"
      type="button"
      role="option"
      :aria-selected="entry.name === gallery.selectedName.value"
      :title="entry.name"
      :class="
        cn(
          'size-14 shrink-0 overflow-hidden rounded-xs bg-white/5 p-0.5 transition-all duration-(--motion-fast)',
          entry.name === gallery.selectedName.value
            ? 'ring-2 ring-white opacity-100'
            : 'opacity-55 hover:opacity-85',
        )
      "
      @click="gallery.select(entry.name)"
    >
      <FilmstripThumb :entry="entry" :cache="gallery.thumbnails" />
    </button>
  </div>
</template>
