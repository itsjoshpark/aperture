<script setup lang="ts">
import { ChevronLeft, ChevronRight, Trash2, X } from "lucide-vue-next";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { useAperture } from "@/composables/useAperture";
import Filmstrip from "./Filmstrip.vue";

const aperture = useAperture();
const { gallery } = aperture;

const url = ref<string | null>(null);
let held: string | null = null;

const entry = computed(() => aperture.selectedEntry.value);
const position = computed(
  () => `${aperture.selectedIndex.value + 1} of ${aperture.displayed.value.length}`,
);

/**
 * The large view holds exactly one full-size image at a time, acquired through
 * the same cache as the thumbnails so the two never decode the same file twice.
 */
watch(
  entry,
  async (next) => {
    if (!next) {
      release();
      return;
    }
    if (held === next.name) return;

    release();
    const name = next.name;
    const acquired = await gallery.thumbnails.acquire(next);
    if (entry.value?.name !== name) {
      gallery.thumbnails.release(name);
      return;
    }
    held = name;
    url.value = acquired;
  },
  { immediate: true },
);

function release(): void {
  if (!held) return;
  gallery.thumbnails.release(held);
  held = null;
  url.value = null;
}

onBeforeUnmount(release);
</script>

<template>
  <!-- Fully opaque: at even 95% the grid's white frames read through as ghost
       rectangles, and nothing should compete with the photo you came here to look at. -->
  <div class="fixed inset-0 z-50 flex flex-col bg-[#2d2d2d]">
    <header class="flex shrink-0 items-center gap-3 px-3 py-2 text-white">
      <Button
        variant="ghost"
        size="icon"
        class="text-white hover:bg-white/10 hover:text-white"
        aria-label="Back to gallery"
        @click="aperture.closeLargeView()"
      >
        <X class="size-4" />
      </Button>

      <p class="min-w-0 flex-1 truncate text-sm font-medium">{{ entry?.name }}</p>
      <p class="shrink-0 text-xs text-white/60">{{ position }}</p>

      <Button
        variant="ghost"
        size="icon"
        class="text-white hover:bg-destructive/20 hover:text-white"
        :aria-label="`Delete ${entry?.name}`"
        @click="aperture.askToDelete()"
      >
        <Trash2 class="size-4" />
      </Button>
    </header>

    <div class="relative flex min-h-0 flex-1 items-center justify-center p-4">
      <Button
        variant="ghost"
        size="icon"
        class="absolute left-2 z-10 text-white hover:bg-white/10 hover:text-white"
        aria-label="Previous image"
        :disabled="aperture.selectedIndex.value <= 0"
        @click="aperture.moveSelectionBy('left')"
      >
        <ChevronLeft class="size-6" />
      </Button>

      <img
        v-if="url"
        :key="entry?.name"
        data-large-image
        :src="url"
        :alt="entry?.name"
        draggable="false"
        class="max-h-full max-w-full object-contain"
      />

      <Button
        variant="ghost"
        size="icon"
        class="absolute right-2 z-10 text-white hover:bg-white/10 hover:text-white"
        aria-label="Next image"
        :disabled="aperture.selectedIndex.value >= aperture.displayed.value.length - 1"
        @click="aperture.moveSelectionBy('right')"
      >
        <ChevronRight class="size-6" />
      </Button>
    </div>

    <Filmstrip />
  </div>
</template>
