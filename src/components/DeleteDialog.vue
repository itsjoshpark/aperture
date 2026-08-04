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
const title = computed(() =>
  count.value === 1
    ? `Delete ${aperture.pendingDeletes.value[0]?.name}?`
    : `Delete ${count.value} images?`,
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
        <!--
          The File System Access API has no route to the Trash — removeEntry is
          a permanent delete. Saying "move to Trash" would be a lie people only
          discover when they go looking for the file.
        -->
        <AlertDialogDescription v-if="count === 1">
          This permanently deletes the file from your disk. It is not moved to the Trash and cannot
          be undone.
        </AlertDialogDescription>
        <AlertDialogDescription v-else>
          This permanently deletes these files from your disk. They are not moved to the Trash and
          cannot be undone.
        </AlertDialogDescription>
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
