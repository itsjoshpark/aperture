<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { useAperture } from "@/composables/useAperture";
import { FolderOpen, Pencil, Undo2 } from "lucide-vue-next";
import { computed } from "vue";
import SortMenu from "./SortMenu.vue";

const aperture = useAperture();
const { gallery, rename } = aperture;

const count = computed(() => aperture.displayed.value.length);
</script>

<template>
  <header class="flex items-center gap-3 border-b bg-card/60 px-3 py-2 backdrop-blur">
    <Button size="sm" class="gap-1.5" @click="aperture.openFolder()">
      <FolderOpen class="size-4" />
      Open folder
    </Button>

    <div class="min-w-0">
      <p class="truncate text-sm font-medium">{{ gallery.label.value }}</p>
    </div>

    <p class="shrink-0 text-xs text-muted-foreground">
      {{ count }} image{{ count === 1 ? "" : "s" }}
    </p>

    <div class="ml-auto flex items-center gap-2">
      <SortMenu />

      <Button
        v-if="!rename.active.value"
        size="sm"
        class="gap-1.5"
        :disabled="count === 0"
        @click="aperture.enterRename()"
      >
        <Pencil class="size-4" />
        Rename…
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
