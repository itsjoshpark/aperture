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
import { Button } from "@/components/ui/button";
import { useAperture } from "@/composables/useAperture";

const aperture = useAperture();
const { guard, rename } = aperture;

const open = computed({
  get: () => guard.open.value,
  set: (next: boolean) => {
    if (!next) guard.dismiss();
  },
});

/**
 * Rename, then carry on with whatever the user was trying to do. If the rename
 * fails there is nothing to discard yet, so the queued action is dropped and
 * they stay where they are with the error in front of them.
 */
async function renameThenProceed(): Promise<void> {
  const ok = await rename.apply();
  if (ok) await guard.proceed();
  else guard.dismiss();
}
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Rename before you go?</AlertDialogTitle>
        <AlertDialogDescription>
          You have arranged these images but not renamed them yet. Leaving now discards the order
          you set — the files themselves are untouched either way.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter class="sm:justify-between">
        <AlertDialogCancel class="mt-0">Cancel</AlertDialogCancel>
        <div class="flex gap-2">
          <AlertDialogAction as-child>
            <Button variant="outline" @click="guard.proceed()">Discard changes</Button>
          </AlertDialogAction>
          <AlertDialogAction
            as-child
            :disabled="!rename.plan.value.valid || rename.plan.value.changes.length === 0"
          >
            <Button @click="renameThenProceed()">Rename now</Button>
          </AlertDialogAction>
        </div>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
