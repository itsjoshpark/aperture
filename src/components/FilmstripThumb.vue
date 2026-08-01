<script setup lang="ts">
import { useIntersectionObserver } from "@vueuse/core";
import { ImageOff } from "lucide-vue-next";
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { isPreviewable } from "@/lib/file-names";
import type { ImageEntry } from "@/lib/fs/types";
import type { ThumbnailCache } from "@/lib/thumbnails";

const props = defineProps<{ entry: ImageEntry; cache: ThumbnailCache }>();

const root = shallowRef<HTMLElement | null>(null);
const url = ref<string | null>(null);
const failed = ref(false);
let held: string | null = null;

const noPreview = computed(() => !isPreviewable(props.entry.name) || failed.value);

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
  if (held === props.entry.name) return;
  release();

  // Nothing to decode for a format this browser has no decoder for.
  if (!isPreviewable(props.entry.name)) return;

  const name = props.entry.name;
  const next = await props.cache.acquire(props.entry);
  if (props.entry.name !== name) {
    props.cache.release(name);
    return;
  }
  held = name;
  url.value = next;
}

function release(): void {
  failed.value = false;
  if (!held) return;
  props.cache.release(held);
  held = null;
  url.value = null;
}

watch(
  () => props.entry.name,
  () => {
    if (held) acquire();
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
      class="size-full object-cover"
      @error="failed = true"
    />

    <!-- At filmstrip size there is no room for words, only for "not a photo we
         can draw" — the large view above spells out why. -->
    <span v-else-if="noPreview" class="flex size-full items-center justify-center">
      <ImageOff class="size-4 text-white/30" aria-hidden="true" />
      <span class="sr-only">{{ entry.name }} — no preview</span>
    </span>
  </span>
</template>
