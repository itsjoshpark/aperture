<script setup lang="ts">
import { computed } from "vue";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAperture } from "@/composables/useAperture";

const aperture = useAperture();

const count = computed(() => aperture.pendingDeletes.value.length);
const one = computed(() => count.value === 1);

const title = computed(() =>
  one.value ? `Delete ${aperture.pendingDeletes.value[0]?.name}?` : `Delete ${count.value} images?`,
);

/**
 * The File System Access API has no route to the Trash — `removeEntry` is a
 * permanent delete. Saying "move to Trash" would be a lie people only discover
 * when they go looking for the file, so the sentence is written once and only
 * its nouns are inflected.
 */
const description = computed(() =>
  one.value
    ? "This permanently deletes the file from your disk. It is not moved to the Trash and cannot be undone."
    : "This permanently deletes these files from your disk. They are not moved to the Trash and cannot be undone.",
);

const open = computed({
  get: () => aperture.deleteDialogOpen.value,
  set: (next: boolean) => {
    if (!next) aperture.cancelDelete();
  },
});
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ title }}</AlertDialogTitle>
        <AlertDialogDescription>{{ description }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" @click="aperture.confirmDelete()">
          Delete permanently
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
