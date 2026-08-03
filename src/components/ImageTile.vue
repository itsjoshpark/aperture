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
const pending = ref(false);
/**
 * The name this tile has an outstanding `acquire()` for. Tracked separately from
 * `url`, because a HEIC takes hundreds of milliseconds to decode and everything
 * that can happen to a tile — scrolling away, being recycled onto another file,
 * a rename — can happen inside that window.
 */
let requested: string | null = null;

/** True only when this tile's name would actually change. */
const renaming = computed(() => !!props.previewName && props.previewName !== props.entry.name);

/**
 * Known-undecodable formats are reported without even trying, so there is no
 * flash of empty frame; anything else falls back to the `error` event and to a
 * rejected acquire, which between them cover corrupt files, HEICs libheif will
 * not read, and formats we have not thought of.
 */
const unsupported = computed(() => !isPreviewable(props.entry.name));
const noPreview = computed(() => unsupported.value || failed.value);
const decoding = computed(() => pending.value && !noPreview.value);

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
  const name = props.entry.name;
  if (requested === name) return;
  release();

  // No point reading bytes nothing can turn into an image.
  if (unsupported.value) return;

  requested = name;
  pending.value = true;

  let next: string;
  try {
    next = await props.cache.acquire(props.entry);
  } catch {
    // Released while we waited — the cache has already been told, and whatever
    // replaced this request owns the tile now.
    if (requested !== name) return;
    pending.value = false;
    failed.value = true;
    return;
  }

  // The tile may have been recycled onto a different file, or scrolled out of
  // view, while we were reading. The ref is ours to hand back either way.
  if (requested !== name) {
    props.cache.release(name);
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
  props.cache.release(requested);
  requested = null;
}

// Renaming changes the cache key, so the tile has to re-read under the new name.
watch(
  () => props.entry.name,
  () => {
    if (requested) acquire();
  },
);

onBeforeUnmount(release);

defineExpose({
  el: root,
  scrollIntoView: (options?: ScrollIntoViewOptions) => root.value?.scrollIntoView(options),
});
</script>

<template>
  <!--
    The grid cell. It never moves during a drag — only the card inside it does —
    so it doubles as the drop placeholder, and `z-20` on it is what floats the
    lifted card over the neighbouring tiles.

    `transition: none` while dragging is load-bearing: a drag reorders the grid
    under us, and without it the placeholder would FLIP-animate to its new cell
    over `--motion-slow` while the card's offset — measured against this element
    — drifted under the cursor for the whole of it.
  -->
  <div
    ref="root"
    role="gridcell"
    :aria-hidden="removing || undefined"
    :aria-selected="selected && !removing"
    :tabindex="selected && !removing ? 0 : -1"
    :class="
      cn(
        'group relative flex flex-col rounded-sm select-none',
        'transition-[transform,opacity] duration-(--motion-fast) ease-(--motion-ease)',
        'focus-visible:outline-none',
        dragging && 'z-20',
        removing && 'scale-90 opacity-0',
        draggable ? 'touch-none' : 'touch-manipulation',
      )
    "
    :style="dragging ? { transition: 'none' } : undefined"
    @pointerdown="emit('dragStart', $event)"
    @click="emit('select')"
    @dblclick="emit('activate')"
  >
    <!--
      Where the tile will land when the button comes up. The tile itself stays
      in this cell — only the card below is offset — so an outline drawn on its
      own layer, costing no layout, is the whole of it.
    -->
    <span
      v-if="dragging"
      data-drop-placeholder
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 rounded-sm border-2 border-dashed border-muted-foreground/40"
    />

    <!--
      The tile's contents. It has no surface of its own — the photo is the tile —
      and exists as a separate element from the grid cell above only so that a
      drag can offset it without moving the cell it is being dragged out of.
    -->
    <div
      :class="
        cn(
          'relative flex flex-col rounded-sm',
          'transition-[box-shadow] duration-(--motion-fast) ease-(--motion-ease)',
          // A lifted tile is the one time it needs a surface. Bare, it is
          // transparent everywhere but the photo, so the tile it is dragged over
          // shows through the caption — and it reads as a photo sliding around
          // rather than as a tile being carried. `--background` rather than a
          // lighter card colour: it is a piece of the grid picked up, and the
          // shadow is what says it has been.
          dragging && 'cursor-grabbing bg-background shadow-(--tile-shadow-lifted)',
        )
      "
      :style="
        dragging && translate
          ? { transform: `translate3d(${translate.x}px, ${translate.y}px, 0)`, transition: 'none' }
          : undefined
      "
    >
      <!-- White, because on a wall of bare photographs against dark chrome it is
           the only thing that cannot be mistaken for part of an image. On its own
           layer so the image box's `overflow-hidden` cannot clip it and so
           drawing it does not shift the photo by a pixel. -->
      <span
        v-if="selected"
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 rounded-sm ring-2 ring-white ring-offset-2 ring-offset-background"
      />

      <div class="relative aspect-square w-full overflow-hidden rounded-sm">
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
          HEIC is decoded here rather than by Chrome, which takes long enough to
          watch. Shimmer rather than an empty frame, for the same reason the
          fallback below exists.
        -->
        <div v-if="decoding" class="preview-shimmer absolute inset-0" aria-hidden="true" />

        <!--
          A frame with nothing in it reads as a broken app. Say which it is: a
          format nothing can decode, or a file that would not open.
        -->
        <div
          v-if="noPreview"
          class="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center"
        >
          <ImageOff class="size-5 text-muted-foreground/50" aria-hidden="true" />
          <p class="text-[10px] leading-tight font-medium text-muted-foreground">No preview</p>
          <p v-if="unsupported" class="text-[9px] leading-tight text-muted-foreground/70">
            {{ entry.ext.slice(1).toUpperCase() }} can't be previewed
          </p>
        </div>
      </div>

      <div class="mt-1.5 flex items-center gap-1">
        <!--
          Dead weight opposite the delete button, and the only reason the name is
          centred on the tile rather than on whatever is left over beside it. It
          has to stay the same size as the button.
        -->
        <span class="size-5.5 shrink-0" aria-hidden="true" />

        <!--
          In rename mode the new name goes on the primary line and the old one
          below it: side by side, the arrow and the struck-through original eat
          most of the width and truncate away the only part you are checking.
        -->
        <div class="min-w-0 flex-1 text-center" :title="entry.name">
          <p class="truncate text-[11px] leading-4" :class="renaming && 'font-medium'">
            {{ previewName ?? entry.name }}
          </p>
          <p
            v-if="renaming"
            class="truncate text-[10px] leading-3.5 text-muted-foreground line-through"
          >
            {{ entry.name }}
          </p>
        </div>

        <!-- On hover alone: a delete control pinned to the selected tile would be
             the one thing permanently drawn beside every photograph. -->
        <button
          type="button"
          :aria-label="`Delete ${entry.name}`"
          class="control-face control-face-delete size-5.5 shrink-0 rounded-xs p-1 opacity-0 transition-opacity duration-(--motion-fast) group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive"
          @click.stop="emit('remove')"
          @pointerdown.stop
        >
          <Trash2 class="size-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>
