<script setup lang="ts">
import type { DropdownMenuSeparatorProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { DropdownMenuSeparator } from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps<
  DropdownMenuSeparatorProps & {
    class?: HTMLAttributes["class"];
  }
>();

const delegatedProps = reactiveOmit(props, "class");

/*
 * Aperture change: `--control-divider` instead of `bg-border`. The panel is the
 * control face, not the chrome, so `--border` is tuned to the wrong backdrop.
 */
</script>

<template>
  <DropdownMenuSeparator
    data-slot="dropdown-menu-separator"
    v-bind="delegatedProps"
    :class="cn('bg-(--control-divider) -mx-1 my-1 h-px', props.class)"
  />
</template>
