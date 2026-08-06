<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { useAperture } from "@/composables/useAperture";
import { OPEN_FOLDER_HINT } from "@/lib/platform";
import { Aperture, FolderOpen } from "@lucide/vue";

const aperture = useAperture();
</script>

<template>
  <div class="grid min-h-dvh place-items-center p-6">
    <div class="max-w-md text-center">
      <Aperture
        class="mx-auto size-20 text-muted-foreground"
        aria-hidden="true"
        :stroke-width="1.2"
      />

      <h1 class="text-5xl font-semibold tracking-tight">Aperture</h1>

      <p class="mt-3 text-sm text-muted-foreground">
        Browse a folder of images, delete the ones you don't want, and drag the rest into an order —
        Aperture renames them to match.
      </p>

      <div class="mt-8 flex justify-center">
        <Button
          size="lg"
          class="gap-2"
          aria-keyshortcuts="Meta+O Control+O"
          @click="aperture.openFolder()"
        >
          <FolderOpen class="size-4" />
          Open folder…
          <!-- Hidden from the accessibility tree so it stays out of the button's
               name; `aria-keyshortcuts` above states the shortcut properly. The
               pill is tinted with `currentColor`, so it follows the face it sits
               on instead of picking a colour that only works on one of them —
               and the glyph keeps its full strength, because the pill is already
               doing the work of setting the hint apart. Dimming both puts the
               label and its own background on the same slope and the shortcut
               stops being legible. -->
          <kbd class="rounded bg-current/20 px-1.5 py-0.5 font-sans text-xs" aria-hidden="true">{{
            OPEN_FOLDER_HINT
          }}</kbd>
        </Button>
      </div>

      <p v-if="aperture.gallery.error.value" class="mt-6 text-sm text-destructive" role="alert">
        {{ aperture.gallery.error.value }}
      </p>

      <p class="mt-10 text-xs text-muted-foreground">
        Your images stay on your machine. Nothing is uploaded.
      </p>
    </div>
  </div>
</template>
