<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { useAperture } from "@/composables/useAperture";
import { OPEN_FOLDER_HINT } from "@/lib/platform";
import { FolderOpen, Pencil, Trash2, Undo2 } from "lucide-vue-next";
import { computed } from "vue";
import SortMenu from "./SortMenu.vue";

const aperture = useAperture();
const { gallery, rename } = aperture;

const count = computed(() => aperture.displayed.value.length);
</script>

<template>
  <header class="flex items-center gap-3 border-b bg-card/60 px-3 py-2 backdrop-blur">
    <Button
      size="sm"
      class="gap-1.5"
      aria-keyshortcuts="Meta+O Control+O"
      @click="aperture.openFolder()"
    >
      <FolderOpen class="size-4" />
      Open folder
      <!-- See `LandingScreen.vue` for why the hint is `aria-hidden`, tinted with
           `currentColor`, and not dimmed on top of that. -->
      <kbd class="rounded bg-current/20 px-1.5 py-0.5 font-sans text-xs" aria-hidden="true">{{
        OPEN_FOLDER_HINT
      }}</kbd>
    </Button>

    <div class="min-w-0">
      <p class="truncate text-sm font-medium">{{ gallery.label.value }}</p>
    </div>

    <p class="shrink-0 text-xs text-muted-foreground">
      {{ count }} image{{ count === 1 ? "" : "s" }}
    </p>

    <div class="ml-auto flex items-center gap-2">
      <Button
        variant="danger"
        size="sm"
        class="gap-1.5"
        aria-keyshortcuts="Delete"
        :disabled="gallery.selectedNames.value.size === 0"
        @click="aperture.askToDelete()"
      >
        <Trash2 class="size-4" />
        Delete
      </Button>

      <SortMenu />

      <Button
        v-if="!rename.active.value"
        size="sm"
        class="gap-1.5"
        :disabled="count === 0"
        @click="aperture.enterRename()"
      >
        <Pencil class="size-4" />
        Bulk Rename…
      </Button>

      <Button
        v-if="rename.canUndo.value && !rename.active.value"
        size="sm"
        class="gap-1.5"
        @click="aperture.undoRename()"
      >
        <Undo2 class="size-4" />
        Undo rename
      </Button>
    </div>
  </header>
</template>
