<script setup lang="ts">
import { useIntersectionObserver } from "@vueuse/core";
import { ImageOff } from "@lucide/vue";
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { isPreviewable } from "@/lib/file-names";
import type { ImageEntry } from "@/lib/fs/types";
import type { ThumbnailCache } from "@/lib/thumbnails";

const props = defineProps<{ entry: ImageEntry; cache: ThumbnailCache }>();

const root = shallowRef<HTMLElement | null>(null);
const url = ref<string | null>(null);
const loaded = ref(false);
const failed = ref(false);
const pending = ref(false);
/** See `ImageTile` — the entry with an outstanding `acquire()`, which a slow
 *  HEIC decode gives plenty of time to go stale. */
let requested: ImageEntry | null = null;

const noPreview = computed(() => !isPreviewable(props.entry.name) || failed.value);
const decoding = computed(() => pending.value && !noPreview.value);

// Same acquire/release discipline as the grid tiles: a filmstrip for a large
// folder is just as many images, only smaller.
useIntersectionObserver(
  root,
  ([entry]) => {
    if (entry?.isIntersecting) acquire();
    else release();
  },
  { rootMargin: "0px 400px" },
);

async function acquire(): Promise<void> {
  const entry = props.entry;
  if (requested === entry) return;
  release();

  // Nothing to show for a format nothing can decode.
  if (!isPreviewable(entry.name)) return;

  requested = entry;
  pending.value = true;

  let next: string;
  try {
    next = await props.cache.acquire(entry);
  } catch {
    if (requested !== entry) return;
    pending.value = false;
    failed.value = true;
    return;
  }

  if (requested !== entry) {
    props.cache.release(entry.name);
    return;
  }
  pending.value = false;
  url.value = next;
}

function release(): void {
  url.value = null;
  loaded.value = false;
  failed.value = false;
  pending.value = false;

  if (requested === null) return;
  props.cache.release(requested.name);
  requested = null;
}

// On the entry, not the name: see `ImageTile`. A rename can leave a name where
// it was and put a different photo behind it.
watch(
  () => props.entry,
  () => {
    if (requested) acquire();
  },
);

onBeforeUnmount(release);
</script>

<template>
  <span ref="root" class="block size-full">
    <img
      v-if="url && !failed"
      :src="url"
      :alt="entry.name"
      draggable="false"
      decoding="async"
      :class="[
        'size-full object-cover transition-opacity duration-(--motion-fast)',
        loaded ? 'opacity-100' : 'opacity-0',
      ]"
      @load="loaded = true"
      @error="failed = true"
    />

    <!-- A HEIC being decoded. Tinted from `currentColor`, so it needs a colour
         to work from against the dark strip. -->
    <span
      v-else-if="decoding"
      class="preview-shimmer block size-full text-white"
      aria-hidden="true"
    />

    <!-- At filmstrip size there is no room for words, only for "not a photo we
         can draw" — the large view above spells out why. -->
    <span v-else-if="noPreview" class="flex size-full items-center justify-center">
      <ImageOff class="size-4 text-white/30" aria-hidden="true" />
      <span class="sr-only">{{ entry.name }} — no preview</span>
    </span>
  </span>
</template>
