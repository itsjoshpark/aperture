<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { useAperture } from "@/composables/useAperture";
import { isPreviewable } from "@/lib/file-names";
import { ChevronLeft, ChevronRight, ImageOff, Trash2, X } from "lucide-vue-next";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import Filmstrip from "./Filmstrip.vue";

const aperture = useAperture();
const { gallery } = aperture;

const url = ref<string | null>(null);
const loaded = ref(false);
const failed = ref(false);
const pending = ref(false);
/** See `ImageTile` — the name with an outstanding `acquire()`. Arrowing through
 *  a folder can move the selection several times inside one HEIC decode. */
let requested: string | null = null;

const entry = computed(() => aperture.selectedEntry.value);
const position = computed(
  () => `${aperture.selectedIndex.value + 1} of ${aperture.displayed.value.length}`,
);

const unsupported = computed(() => !!entry.value && !isPreviewable(entry.value.name));
const noPreview = computed(() => unsupported.value || failed.value);
const decoding = computed(() => pending.value && !noPreview.value);

/**
 * The large view holds exactly one image at a time, acquired through the same
 * cache as the thumbnails so the two never decode the same file twice — which
 * for HEIC is the difference between opening instantly and waiting for libheif
 * all over again.
 */
watch(
  entry,
  async (next) => {
    if (!next) {
      release();
      return;
    }
    const name = next.name;
    if (requested === name) return;

    release();
    if (!isPreviewable(name)) return;

    requested = name;
    pending.value = true;

    let acquired: string;
    try {
      acquired = await gallery.thumbnails.acquire(next);
    } catch {
      if (requested !== name) return;
      pending.value = false;
      failed.value = true;
      return;
    }

    if (requested !== name) {
      gallery.thumbnails.release(name);
      return;
    }
    pending.value = false;
    url.value = acquired;
  },
  { immediate: true },
);

function release(): void {
  url.value = null;
  loaded.value = false;
  failed.value = false;
  pending.value = false;

  if (requested === null) return;
  gallery.thumbnails.release(requested);
  requested = null;
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
        v-if="url && !failed"
        :key="entry?.name"
        data-large-image
        :src="url"
        :alt="entry?.name"
        draggable="false"
        :class="[
          'max-h-full max-w-full object-contain transition-opacity duration-(--motion-fast)',
          loaded ? 'opacity-100' : 'opacity-0',
        ]"
        @load="loaded = true"
        @error="failed = true"
      />

      <!-- Decoding a HEIC. Sized to the frame rather than the photo, whose
           dimensions are exactly what we do not know yet. -->
      <div
        v-else-if="decoding"
        class="preview-shimmer size-full max-h-full max-w-3xl rounded-sm text-white"
        aria-hidden="true"
      />

      <div v-else-if="noPreview" class="flex flex-col items-center gap-3 text-center text-white/60">
        <ImageOff class="size-10" aria-hidden="true" />
        <p class="text-sm font-medium text-white/80">No preview available</p>
        <p v-if="unsupported" class="max-w-xs text-xs">
          Nothing in the browser can draw {{ entry?.ext.slice(1).toUpperCase() }}. The file is fine
          — you can still sort, rename and delete it here.
        </p>
      </div>

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
