<script setup lang="ts">
import { AlertTriangle, Check, X } from "@lucide/vue";
import { computed } from "vue";
import { useAperture } from "@/composables/useAperture";

/**
 * What the last operation did, while a folder is open: a delete the disk
 * refused, a rename that landed.
 *
 * `LandingScreen` shows the same error text, but only ever the one kind: a
 * folder that would not open, at a moment when there is no gallery to put a
 * banner over. Everything that happens *after* that happens with the landing
 * screen unmounted, and without this the message would be written to a ref
 * nothing renders.
 *
 * A failure outranks a success, which is why the two are held in separate refs:
 * a delete that went wrong must not be papered over by the next thing that went
 * right.
 *
 * Dismissible, unlike `RecoveryBanner`: leftover temp files are a standing
 * condition that persists until they are dealt with, whereas this describes an
 * event that has already finished happening.
 */
const aperture = useAperture();
const { gallery } = aperture;

const failed = computed(() => gallery.error.value !== null);
const text = computed(() => gallery.error.value ?? gallery.notice.value);
</script>

<template>
  <div
    v-if="text"
    :role="failed ? 'alert' : 'status'"
    :class="[
      'flex items-start gap-2 border-b px-4 py-2 text-xs',
      failed ? 'border-destructive/30 bg-destructive/10' : 'bg-muted/40',
    ]"
  >
    <AlertTriangle v-if="failed" class="mt-0.5 size-3.5 shrink-0 text-destructive" />
    <Check v-else class="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />

    <p class="flex-1 text-muted-foreground">
      {{ text }}
    </p>

    <button
      type="button"
      class="-my-0.5 shrink-0 rounded-xs p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      aria-label="Dismiss"
      @click="failed ? gallery.dismissError() : gallery.dismissNotice()"
    >
      <X class="size-3.5" />
    </button>
  </div>
</template>
