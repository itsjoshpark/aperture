<script setup lang="ts">
import { useIntersectionObserver } from "@vueuse/core";
import { ImageOff, Trash2 } from "lucide-vue-next";
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { isPreviewable } from "@/lib/file-names";
import type { ImageEntry } from "@/lib/fs/types";
import type { ThumbnailCache } from "@/lib/thumbnails";
import { cn } from "@/lib/utils";

const props = defineProps<{
  entry: ImageEntry;
  cache: ThumbnailCache;
  selected: boolean;
  /** Name the file will take if the current rename is applied. */
  previewName?: string;
  removing?: boolean;
  dragging?: boolean;
  draggable?: boolean;
  translate?: { x: number; y: number };
}>();

const emit = defineEmits<{
  select: [];
  activate: [];
  remove: [];
  dragStart: [event: PointerEvent];
}>();

const root = shallowRef<HTMLElement | null>(null);
const url = ref<string | null>(null);
const loaded = ref(false);
const failed = ref(false);
let held: string | null = null;

/** True only when this tile's name would actually change. */
const renaming = computed(() => !!props.previewName && props.previewName !== props.entry.name);

/**
 * Known-undecodable formats are reported without even trying, so there is no
 * flash of empty frame; anything else falls back to the `error` event, which
 * covers corrupt files and formats we have not thought of.
 */
const unsupported = computed(() => !isPreviewable(props.entry.name));
const noPreview = computed(() => unsupported.value || failed.value);

/**
 * A folder of 2,000 photos is far more pixel data than a tab can hold, so a tile
 * only takes a decoded URL while it is near the viewport and hands it back on
 * the way out. `rootMargin` starts the read a screen early, which is enough for
 * images to be ready by the time they are scrolled to.
 */
useIntersectionObserver(
  root,
  ([entry]) => {
    if (entry?.isIntersecting) acquire();
    else release();
  },
  { rootMargin: "600px 0px" },
);

async function acquire(): Promise<void> {
  if (held === props.entry.name) return;
  release();

  // No point decoding bytes the browser has no decoder for.
  if (unsupported.value) return;

  const name = props.entry.name;
  const next = await props.cache.acquire(props.entry);
  // The tile may have been recycled onto a different file while we were reading.
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
  loaded.value = false;
  failed.value = false;
}

// Renaming changes the cache key, so the tile has to re-read under the new name.
watch(
  () => props.entry.name,
  () => {
    if (held) acquire();
  },
);

onBeforeUnmount(release);

defineExpose({
  el: root,
  scrollIntoView: (options?: ScrollIntoViewOptions) => root.value?.scrollIntoView(options),
});
</script>

<template>
  <div
    ref="root"
    role="gridcell"
    :aria-hidden="removing || undefined"
    :aria-selected="selected && !removing"
    :tabindex="selected && !removing ? 0 : -1"
    :class="
      cn(
        'group relative flex flex-col rounded-sm bg-frame p-2 text-frame-foreground select-none',
        'transition-[box-shadow,transform,opacity] duration-(--motion-fast) ease-(--motion-ease)',
        'focus-visible:outline-none',
        selected ? 'shadow-(--frame-shadow-selected)' : 'shadow-(--frame-shadow)',
        dragging && 'z-20 cursor-grabbing shadow-(--frame-shadow-lifted)',
        removing && 'scale-90 opacity-0',
        draggable ? 'touch-none' : 'touch-manipulation',
      )
    "
    :style="
      dragging && translate
        ? { transform: `translate3d(${translate.x}px, ${translate.y}px, 0)`, transition: 'none' }
        : undefined
    "
    @pointerdown="emit('dragStart', $event)"
    @click="emit('select')"
    @dblclick="emit('activate')"
  >
    <!-- The selection ring lives on its own layer so it is not clipped by the
         frame's padding and does not shift the image by a pixel. -->
    <span
      v-if="selected"
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 rounded-sm ring-2 ring-ring ring-offset-2 ring-offset-background"
    />

    <div class="relative aspect-square w-full overflow-hidden rounded-xs bg-frame-well">
      <img
        v-if="url && !failed"
        :src="url"
        :alt="entry.name"
        draggable="false"
        decoding="async"
        :class="
          cn(
            'size-full object-contain transition-opacity duration-(--motion-fast)',
            loaded ? 'opacity-100' : 'opacity-0',
          )
        "
        @load="loaded = true"
        @error="failed = true"
      />

      <!--
        A frame with nothing in it reads as a broken app. Say which it is: a
        format this browser has no decoder for, or a file that would not open.
      -->
      <div
        v-if="noPreview"
        class="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center"
      >
        <ImageOff class="size-5 text-frame-foreground/30" aria-hidden="true" />
        <p class="text-[10px] leading-tight font-medium text-frame-foreground/55">No preview</p>
        <p v-if="unsupported" class="text-[9px] leading-tight text-frame-foreground/40">
          {{ entry.ext.slice(1).toUpperCase() }} isn't supported by this browser
        </p>
      </div>
    </div>

    <div class="mt-1.5 flex items-center gap-1">
      <!--
        In rename mode the new name goes on the primary line and the old one
        below it: side by side, the arrow and the struck-through original eat
        most of the width and truncate away the only part you are checking.
      -->
      <div class="min-w-0 flex-1" :title="entry.name">
        <p class="truncate text-[11px] leading-4" :class="renaming && 'font-medium'">
          {{ previewName ?? entry.name }}
        </p>
        <p
          v-if="renaming"
          class="truncate text-[10px] leading-3.5 text-frame-foreground/45 line-through"
        >
          {{ entry.name }}
        </p>
      </div>

      <button
        type="button"
        :aria-label="`Delete ${entry.name}`"
        :class="
          cn(
            'shrink-0 rounded-xs p-0.5 text-frame-foreground/50 transition-colors',
            'hover:bg-destructive/10 hover:text-destructive',
            'focus-visible:ring-2 focus-visible:ring-destructive focus-visible:outline-none',
            'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
            selected && 'opacity-100',
          )
        "
        @click.stop="emit('remove')"
        @pointerdown.stop
      >
        <Trash2 class="size-3.5" />
      </button>
    </div>
  </div>
</template>
