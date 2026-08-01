<script setup lang="ts">
import { onMounted, shallowRef } from "vue";
import AppToolbar from "@/components/AppToolbar.vue";
import DeleteDialog from "@/components/DeleteDialog.vue";
import DiscardChangesDialog from "@/components/DiscardChangesDialog.vue";
import GalleryGrid from "@/components/GalleryGrid.vue";
import LandingScreen from "@/components/LandingScreen.vue";
import LargeView from "@/components/LargeView.vue";
import RecoveryBanner from "@/components/RecoveryBanner.vue";
import RenameBar from "@/components/RenameBar.vue";
import SizeSlider from "@/components/SizeSlider.vue";
import UnsupportedBrowser from "@/components/UnsupportedBrowser.vue";
import { useAperture } from "@/composables/useAperture";
import { useKeyboard } from "@/composables/useKeyboard";
import { useLargeViewTransition } from "@/composables/useLargeViewTransition";

const aperture = useAperture();
useKeyboard(aperture);

const grid = shallowRef<InstanceType<typeof GalleryGrid> | null>(null);

const largeView = useLargeViewTransition(aperture.motion, () => {
  const name = aperture.gallery.selectedName.value;
  return name ? (grid.value?.getTileRect(name) ?? null) : null;
});

onMounted(() => aperture.restoreLastFolder());
</script>

<template>
  <UnsupportedBrowser v-if="!aperture.supported" />

  <LandingScreen v-else-if="!aperture.hasFolder.value" />

  <div v-else class="flex h-dvh flex-col">
    <AppToolbar />
    <RecoveryBanner />

    <GalleryGrid ref="grid" />

    <p
      v-if="aperture.gallery.isEmpty.value"
      class="px-4 pb-6 text-center text-sm text-muted-foreground"
    >
      No images in this folder.
    </p>

    <RenameBar v-if="aperture.rename.active.value" />

    <footer
      v-else
      class="flex shrink-0 items-center justify-end border-t bg-card/60 px-4 py-2 backdrop-blur"
    >
      <SizeSlider />
    </footer>

    <Transition :css="false" @enter="largeView.onEnter" @leave="largeView.onLeave">
      <LargeView v-if="aperture.gallery.view.value === 'large'" />
    </Transition>

    <DeleteDialog />
    <DiscardChangesDialog />
  </div>
</template>
