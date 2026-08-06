<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useAperture } from "@/composables/useAperture";
import { AlertTriangle, Check, Info, Undo2 } from "@lucide/vue";
import { computed } from "vue";

const aperture = useAperture();
const { rename } = aperture;

const changeCount = computed(() => rename.plan.value.changes.length);
const problem = computed(() => rename.plan.value.problems[0] ?? null);

const padding = computed({
  get: () => (rename.options.value.padding === "auto" ? "" : String(rename.options.value.padding)),
  set: (next: string) => {
    const parsed = Number.parseInt(next, 10);
    rename.options.value = {
      ...rename.options.value,
      padding: Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 9) : "auto",
    };
  },
});

const startIndex = computed({
  get: () => String(rename.options.value.startIndex),
  set: (next: string) => {
    const parsed = Number.parseInt(next, 10);
    rename.options.value = {
      ...rename.options.value,
      startIndex: Number.isFinite(parsed) && parsed >= 0 ? parsed : 1,
    };
  },
});

const progressValue = computed(() => {
  const progress = rename.progress.value;
  if (!progress || progress.total === 0) return 0;
  return Math.round((progress.completed / progress.total) * 100);
});

const canApply = computed(
  () => rename.plan.value.valid && changeCount.value > 0 && !rename.applying.value,
);
</script>

<template>
  <div class="border-t bg-card/60 px-4 py-3 backdrop-blur">
    <div class="flex flex-wrap items-end gap-x-4 gap-y-3">
      <!--
        Once the rename has landed these describe what already happened, so they
        go read-only rather than inviting edits that would do nothing.
      -->
      <div
        class="flex flex-wrap items-end gap-4"
        :inert="rename.applied.value || undefined"
        :class="rename.applied.value && 'opacity-50'"
      >
        <div class="grid gap-1">
          <Label for="rename-prefix" class="text-xs text-muted-foreground">Prefix</Label>
          <Input
            id="rename-prefix"
            v-model="rename.options.value.prefix"
            class="h-8 w-40"
            placeholder=""
            autocomplete="off"
            spellcheck="false"
          />
        </div>

        <div class="grid gap-1">
          <Label for="rename-suffix" class="text-xs text-muted-foreground">Suffix</Label>
          <Input
            id="rename-suffix"
            v-model="rename.options.value.suffix"
            class="h-8 w-40"
            placeholder=""
            autocomplete="off"
            spellcheck="false"
          />
        </div>

        <div class="grid gap-1">
          <Label for="rename-start" class="text-xs text-muted-foreground">Start at</Label>
          <Input id="rename-start" v-model="startIndex" class="h-8 w-20" inputmode="numeric" />
        </div>

        <div class="grid gap-1">
          <Label for="rename-padding" class="text-xs text-muted-foreground">Digits</Label>
          <Input
            id="rename-padding"
            v-model="padding"
            class="h-8 w-20"
            inputmode="numeric"
            placeholder="Auto"
          />
        </div>
      </div>

      <div class="ml-auto flex items-center gap-2">
        <Button size="sm" :disabled="rename.applying.value" @click="aperture.exitRename()">
          {{ rename.applied.value ? "Done" : "Cancel" }}
        </Button>

        <!--
          One button, two jobs. After a rename lands it becomes Undo in place,
          so the way back is where the way forward was.
        -->
        <Button
          v-if="rename.applied.value"
          size="sm"
          class="gap-1.5"
          :disabled="rename.applying.value"
          @click="aperture.undoRename()"
        >
          <Undo2 class="size-4" />
          {{ rename.applying.value ? "Undoing…" : "Undo rename" }}
        </Button>

        <Button
          v-else
          variant="primary"
          size="sm"
          :disabled="!canApply"
          @click="aperture.applyRename()"
        >
          {{
            rename.applying.value
              ? "Renaming…"
              : `Rename ${changeCount} file${changeCount === 1 ? "" : "s"}`
          }}
        </Button>
      </div>
    </div>

    <p
      v-if="rename.applied.value"
      class="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"
      role="status"
    >
      <Check class="size-3.5 shrink-0" />
      Renamed. Undo puts every original name back.
    </p>

    <p
      v-else-if="problem"
      class="mt-2 flex items-center gap-1.5 text-xs text-destructive"
      role="alert"
    >
      <AlertTriangle class="size-3.5 shrink-0" />
      {{ problem.message }}
    </p>

    <p
      v-else-if="rename.failure.value"
      class="mt-2 flex items-center gap-1.5 text-xs text-destructive"
      role="alert"
    >
      <AlertTriangle class="size-3.5 shrink-0" />
      {{ rename.failure.value }}
    </p>

    <!--
      Worth saying out loud rather than letting people discover it: the browser
      cannot rename a local file in place, so Aperture rewrites it, and the
      file's modified date becomes now. Pixels and EXIF are untouched.
    -->
    <p v-else class="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
      <Info class="size-3.5 shrink-0" />
      Renaming rewrites each file, so its date modified becomes today. The image itself is
      unchanged.
    </p>

    <Progress v-if="rename.applying.value" :model-value="progressValue" class="mt-2 h-1" />
  </div>
</template>
