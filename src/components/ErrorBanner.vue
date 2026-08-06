<script setup lang="ts">
import { AlertTriangle, X } from "@lucide/vue";
import { useAperture } from "@/composables/useAperture";

/**
 * What went wrong with the last operation, while a folder is open.
 *
 * `LandingScreen` shows the same message, but only ever the one kind: a folder
 * that would not open, at a moment when there is no gallery to put a banner
 * over. Everything that fails *after* that — a delete the disk refuses, a
 * listing that goes stale — happens with the landing screen unmounted, and
 * without this the message would be written to a ref nothing renders.
 *
 * Dismissible, unlike `RecoveryBanner`: leftover temp files are a standing
 * condition that persists until they are dealt with, whereas this describes an
 * event that has already finished happening.
 */
const aperture = useAperture();
</script>

<template>
  <div
    v-if="aperture.gallery.error.value"
    role="alert"
    class="flex items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs"
  >
    <AlertTriangle class="mt-0.5 size-3.5 shrink-0 text-destructive" />
    <p class="flex-1 text-muted-foreground">
      {{ aperture.gallery.error.value }}
    </p>
    <button
      type="button"
      class="-my-0.5 shrink-0 rounded-xs p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      aria-label="Dismiss"
      @click="aperture.gallery.dismissError()"
    >
      <X class="size-3.5" />
    </button>
  </div>
</template>
