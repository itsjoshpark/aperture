<script setup lang="ts">
import { useIntersectionObserver } from "@vueuse/core";
import { onBeforeUnmount, ref, shallowRef, watch } from "vue";
import type { ImageEntry } from "@/lib/fs/types";
import type { ThumbnailCache } from "@/lib/thumbnails";

const props = defineProps<{ entry: ImageEntry; cache: ThumbnailCache }>();

const root = shallowRef<HTMLElement | null>(null);
const url = ref<string | null>(null);
let held: string | null = null;

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
      v-if="url"
      :src="url"
      :alt="entry.name"
      draggable="false"
      decoding="async"
      class="size-full object-cover"
    />
  </span>
</template>
