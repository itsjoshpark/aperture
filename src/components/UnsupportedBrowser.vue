<script setup lang="ts">
import { Aperture } from "lucide-vue-next";
</script>

<template>
  <div class="grid min-h-dvh place-items-center p-6">
    <div class="max-w-md text-center">
      <Aperture class="mx-auto size-10 text-muted-foreground" aria-hidden="true" />

      <h1 class="mt-4 text-xl font-semibold">Aperture needs a Chromium browser</h1>

      <p class="mt-3 text-sm text-muted-foreground">
        Aperture reads and renames images directly on your disk using the File System Access API.
        Safari and Firefox support that API only for a private sandbox of the browser's own — they
        have no way to hand a page a folder of yours, so there is nothing here for this page to
        open.
      </p>

      <p class="mt-3 text-sm text-muted-foreground">
        It works in <strong class="text-foreground">Chrome</strong>,
        <strong class="text-foreground">Edge</strong>, <strong class="text-foreground">Arc</strong>,
        and <strong class="text-foreground">Brave</strong> on the desktop.
      </p>

      <p class="mt-6 text-xs text-muted-foreground">
        Nothing is ever uploaded — that same API is what keeps your photos on your machine.
      </p>
    </div>
  </div>
</template>
