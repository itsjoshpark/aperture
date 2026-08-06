<script setup lang="ts">
import { AlertTriangle } from "@lucide/vue";
import { computed } from "vue";
import { useAperture } from "@/composables/useAperture";

const aperture = useAperture();

/**
 * A rename that dies partway — the tab closes, the machine sleeps and the
 * handle goes stale — can leave files parked under their temporary names.
 *
 * They cannot be restored automatically: a temp name records a file's position
 * in the interrupted run, not what it used to be called, and the record that
 * would say is in memory that died with the run. What we *can* do is make sure
 * nobody concludes their photos are gone. The files are intact and still listed
 * in the gallery, just hidden from Finder behind a leading dot.
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
      Nothing was lost — they are in the gallery below under names starting with
      <code class="rounded-xs bg-muted px-1 py-0.5">.aperture-tmp-</code>, which is why Finder hides
      them. Drag them where you want and rename, or fix them by hand in
      <em>{{ aperture.gallery.label.value }}</em
      >.
    </p>
  </div>
</template>
