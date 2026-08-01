<script setup lang="ts">
import { Aperture, FolderOpen, RotateCcw } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { useAperture } from "@/composables/useAperture";

const aperture = useAperture();
</script>

<template>
  <div class="grid min-h-dvh place-items-center p-6">
    <div class="max-w-md text-center">
      <Aperture class="mx-auto size-10 text-muted-foreground" aria-hidden="true" />

      <h1 class="mt-4 text-2xl font-semibold tracking-tight">Aperture</h1>

      <p class="mt-3 text-sm text-muted-foreground">
        Browse a folder of images, delete the ones you don't want, and drag the rest into an order —
        Aperture renames them to match.
      </p>

      <div class="mt-8 flex flex-col items-center gap-3">
        <Button size="lg" class="gap-2" @click="aperture.openFolder()">
          <FolderOpen class="size-4" />
          Open folder…
        </Button>

        <!--
          Handles survive a reload but their permission does not, so reopening
          has to be a click: `requestPermission` only works in a user gesture.
        -->
        <Button
          v-if="aperture.lastFolderName.value"
          variant="ghost"
          size="sm"
          class="gap-2"
          @click="aperture.reopenLastFolder()"
        >
          <RotateCcw class="size-3.5" />
          Reopen {{ aperture.lastFolderName.value }}
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
