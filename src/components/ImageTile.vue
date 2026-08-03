<script setup lang="ts">
import { useIntersectionObserver } from "@vueuse/core";
import { ImageOff } from "lucide-vue-next";
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
  dragStart: [event: PointerEvent];
}>();

const root = shallowRef<HTMLElement | null>(null);
const url = ref<string | null>(null);
const failed = ref(false);
const pending = ref(false);
/** The photo's shape, and so also the proof that it has decoded. */
const ratio = ref<number | null>(null);
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
const loaded = computed(() => ratio.value !== null);

/**
 * Where `object-contain` will draw the photo inside the square, as percentages
 * of that square: a box sized off the image instead is free to outgrow the
 * tile, and the tiles being one size is what lines a row of them up.
 */
const photoBox = computed(() => {
  const shape = ratio.value;
  if (shape === null) return { width: "100%", height: "100%" };
  return shape >= 1
    ? { width: "100%", height: `${100 / shape}%` }
    : { width: `${100 * shape}%`, height: "100%" };
});

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

function onLoad(event: Event): void {
  const image = event.target as HTMLImageElement;
  // Chrome reports these already rotated by EXIF orientation, which is the shape
  // the photo is actually drawn in.
  ratio.value = image.naturalWidth / image.naturalHeight;
}

function release(): void {
  url.value = null;
  failed.value = false;
  pending.value = false;
  ratio.value = null;

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

    `transition: none` while dragging keeps this cell instant. Nothing animates
    it today — `TransitionGroup`'s move transition does not fire, which is why
    `tile-flip.ts` exists — but anything that did would be animating the very
    element the card's offset is measured against, and the card would drift
    under the cursor for as long as it ran.
  -->
  <div
    ref="root"
    role="gridcell"
    :aria-hidden="removing || undefined"
    :aria-selected="selected && !removing"
    :tabindex="selected && !removing ? 0 : -1"
    :class="
      cn(
        'relative flex flex-col rounded-sm select-none',
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
      data-tile-card
      :data-dragging="dragging || undefined"
      :class="
        cn(
          'relative flex flex-col rounded-sm',
          'transition-[box-shadow] duration-(--motion-fast) ease-(--motion-ease)',
          // `flipTiles` animates this element — from the size the tile was, and
          // from the cell it was in — so it needs a corner to pivot on. The
          // cell itself never moves under it, which is what leaves it free to
          // be the drop placeholder.
          'origin-top-left',
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
      <!--
        The square every tile occupies whatever shape its photograph is, which is
        what keeps a row of them lined up. No `overflow-hidden`: the selection
        border is drawn outside the photo and would be clipped away by it.
      -->
      <div class="relative aspect-square w-full">
        <!-- The photo's own box, letterboxing excluded; the square until the
             image has decoded and reported its shape. -->
        <div class="absolute inset-0 m-auto" :style="photoBox">
          <!-- White, because on a wall of bare photographs against dark chrome it
               is the only thing that cannot be mistaken for part of an image.

               Two filled boxes rather than one bordered one: a border's inner
               radius is its outer radius less its width, so a 3px band inside a
               4px corner cannot come out square. The white box carries the
               corner; the fill over it leaves the band and paints the gap. -->
          <span
            v-if="selected"
            data-selection
            aria-hidden="true"
            class="pointer-events-none absolute -inset-[5px] rounded-sm bg-white"
          >
            <span class="absolute inset-[3px] bg-background" />
          </span>

          <!-- Positioned, so the photo paints over that fill. -->
          <img
            v-if="url && !failed"
            :src="url"
            :alt="entry.name"
            draggable="false"
            decoding="async"
            :class="
              cn(
                'relative size-full object-contain transition-opacity duration-(--motion-fast)',
                loaded ? 'opacity-100' : 'opacity-0',
              )
            "
            @load="onLoad"
            @error="failed = true"
          />
        </div>

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

      <!--
        In rename mode the new name goes on the primary line and the old one
        below it: side by side, the arrow and the struck-through original eat
        most of the width and truncate away the only part you are checking.
      -->
      <div class="mt-1.5 min-w-0 text-center" :title="entry.name">
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
    </div>
  </div>
</template>
