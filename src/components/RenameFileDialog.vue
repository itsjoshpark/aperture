<script setup lang="ts">
import { computed, ref, shallowRef, watch } from "vue";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAperture } from "@/composables/useAperture";
import { planSingleRename } from "@/lib/naming";
import { AlertTriangle, Info } from "@lucide/vue";

const aperture = useAperture();
const { gallery } = aperture;

/** The base name being typed. The extension is not the caller's to change. */
const base = ref("");
// A component ref, not an element one: `Input` is a component whose root is the
// `<input>`, so what a template ref hands back is the instance around it.
const field = shallowRef<{ $el: HTMLInputElement } | null>(null);

const entry = computed(() => aperture.pendingRename.value);

// Seeded on open rather than watched off `pendingRename` alone, so re-opening on
// the same file after a cancelled edit starts from the name on disk again.
watch(
  () => aperture.renameDialogOpen.value,
  (open) => {
    if (open) base.value = entry.value?.base ?? "";
  },
);

const plan = computed(() =>
  entry.value ? planSingleRename(entry.value, base.value, gallery.allNames.value) : null,
);

const problem = computed(() => plan.value?.problems[0] ?? null);
const changed = computed(() => (plan.value?.changes.length ?? 0) > 0);
const canRename = computed(() => plan.value !== null && plan.value.valid && changed.value);

const open = computed({
  get: () => aperture.renameDialogOpen.value,
  set: (next: boolean) => {
    if (!next) aperture.cancelRename();
  },
});

/**
 * The field takes focus, not the footer: this dialog is an editor, and the whole
 * of it is the one control. Selected rather than merely focused, so replacing
 * the name outright — the common case — is just typing, the way it is in Finder.
 */
function focusField(): void {
  const input = field.value?.$el;
  input?.focus();
  input?.select();
}

function submit(): void {
  if (canRename.value) void aperture.confirmRename(base.value);
}
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogContent @open-auto-focus.prevent="focusField">
      <AlertDialogHeader>
        <AlertDialogTitle>Rename {{ entry?.name }}</AlertDialogTitle>
        <AlertDialogDescription>
          The extension stays as it is, so the photo stays in the gallery.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div class="grid gap-1">
        <Label for="rename-file-base" class="text-xs text-muted-foreground">New name</Label>
        <div class="flex items-center gap-2">
          <Input
            id="rename-file-base"
            ref="field"
            v-model="base"
            class="h-9 flex-1"
            autocomplete="off"
            spellcheck="false"
            :aria-invalid="problem !== null || undefined"
            @keydown.enter="submit"
          />
          <span class="shrink-0 text-sm text-muted-foreground">{{ entry?.ext }}</span>
        </div>
      </div>

      <p v-if="problem" class="flex items-center gap-1.5 text-xs text-destructive" role="alert">
        <AlertTriangle class="size-3.5 shrink-0" />
        {{ problem.message }}
      </p>

      <!--
        The same caveat the rename bar carries, and for the same reason: the
        browser cannot rename a local file in place, so Aperture rewrites it.
      -->
      <p v-else class="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info class="size-3.5 shrink-0" />
        Renaming rewrites the file, so its date modified becomes today. The image itself is
        unchanged.
      </p>

      <AlertDialogFooter>
        <!--
          A plain button rather than `AlertDialogCancel`, which is not only a
          style: registering one hands Reka a cancel element, and it focuses it
          on open from inside a `nextTick` — after anything this component does,
          so the field could never keep the focus it was given. That default is
          right for a dialog asking whether you meant it, and wrong for one whose
          entire purpose is the text box above.
        -->
        <Button @click="aperture.cancelRename()">Cancel</Button>
        <!--
          Disabled rather than merely ignored on click: `AlertDialogAction`
          dismisses the dialog as part of handling the click, so an invalid name
          that reached the handler would close the dialog and rename nothing.
        -->
        <AlertDialogAction variant="primary" :disabled="!canRename" @click="submit">
          Rename
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
