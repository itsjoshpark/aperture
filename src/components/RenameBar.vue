<script setup lang="ts">
import { AlertTriangle, Info, Undo2 } from "lucide-vue-next";
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useAperture } from "@/composables/useAperture";

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
      <div class="grid gap-1">
        <Label for="rename-prefix" class="text-xs text-muted-foreground">Prefix</Label>
        <Input
          id="rename-prefix"
          v-model="rename.options.value.prefix"
          class="h-8 w-40"
          placeholder="Hawaii-"
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
          placeholder="-raw"
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

      <div class="ml-auto flex items-center gap-2">
        <Button
          v-if="rename.canUndo.value && !rename.active.value"
          variant="outline"
          size="sm"
          class="gap-1.5"
          @click="aperture.undoRename()"
        >
          <Undo2 class="size-4" />
          Undo rename
        </Button>

        <Button
          variant="ghost"
          size="sm"
          :disabled="rename.applying.value"
          @click="aperture.exitRename()"
        >
          Cancel
        </Button>

        <Button size="sm" :disabled="!canApply" @click="aperture.applyRename()">
          {{
            rename.applying.value
              ? "Renaming…"
              : `Rename ${changeCount} file${changeCount === 1 ? "" : "s"}`
          }}
        </Button>
      </div>
    </div>

    <p v-if="problem" class="mt-2 flex items-center gap-1.5 text-xs text-destructive" role="alert">
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
