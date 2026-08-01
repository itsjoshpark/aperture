<script setup lang="ts">
import { ArrowDownAZ, ArrowUpAZ, Check, ChevronDown } from "lucide-vue-next";
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAperture } from "@/composables/useAperture";
import { SORT_LABELS, type SortDirection, type SortField } from "@/lib/sort";

const aperture = useAperture();
const { gallery, rename } = aperture;

/**
 * Rename mode replaces sorting entirely — the order is whatever you dragged it
 * to, which is the whole point — so the control reports that rather than showing
 * a stale field.
 */
const label = computed(() =>
  rename.active.value ? "Custom order" : SORT_LABELS[gallery.sort.value.field],
);

function setField(field: SortField): void {
  gallery.sort.value = { ...gallery.sort.value, field };
}

function setDirection(direction: SortDirection): void {
  gallery.sort.value = { ...gallery.sort.value, direction };
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button size="sm" :disabled="rename.active.value" class="gap-1.5">
        <ArrowDownAZ v-if="gallery.sort.value.direction === 'asc'" class="size-4" />
        <ArrowUpAZ v-else class="size-4" />
        <span>{{ label }}</span>
        <ChevronDown class="size-3.5 opacity-60" />
      </Button>
    </DropdownMenuTrigger>

    <DropdownMenuContent align="start" class="w-48">
      <DropdownMenuItem
        v-for="field in ['name', 'date'] as const"
        :key="field"
        @select="setField(field)"
      >
        <Check :class="gallery.sort.value.field === field ? 'size-4' : 'size-4 opacity-0'" />
        {{ SORT_LABELS[field] }}
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <DropdownMenuItem
        v-for="option in ['asc', 'desc'] as const"
        :key="option"
        @select="setDirection(option)"
      >
        <Check :class="gallery.sort.value.direction === option ? 'size-4' : 'size-4 opacity-0'" />
        {{ option === "asc" ? "Ascending" : "Descending" }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
