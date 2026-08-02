<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { useAperture } from "@/composables/useAperture";
import { Aperture, FolderOpen } from "lucide-vue-next";

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
        <Button size="lg" class="gap-2" @click="aperture.openFolder()">
          <FolderOpen class="size-4" />
          Open folder…
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
