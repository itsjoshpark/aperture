<script setup lang="ts">
import { AlertTriangle } from "lucide-vue-next";
import { computed } from "vue";
import { useAperture } from "@/composables/useAperture";

const aperture = useAperture();

/**
 * A rename that dies partway — the tab closes, the machine sleeps and the
 * handle goes stale — can leave files parked under their temporary names. They
 * are intact, just invisible in Finder behind a leading dot, so say so plainly
 * rather than letting someone conclude their photos are gone.
 */
const count = computed(() => aperture.gallery.leftoverTempNames.value.length);
</script>

<template>
  <div
    v-if="count > 0"
    role="alert"
    class="flex items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs"
  >
    <AlertTriangle class="mt-0.5 size-3.5 shrink-0 text-destructive" />
    <p class="text-muted-foreground">
      <strong class="text-foreground">
        {{ count }} file{{ count === 1 ? "" : "s" }} left over from an interrupted rename.
      </strong>
      They are safe, but hidden: look for names starting with
      <code class="rounded-xs bg-muted px-1 py-0.5">.aperture-tmp-</code> in
      <em>{{ aperture.gallery.label.value }}</em> and rename them back by hand.
    </p>
  </div>
</template>
