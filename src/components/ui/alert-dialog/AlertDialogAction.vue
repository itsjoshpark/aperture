<script setup lang="ts">
import type { AlertDialogActionProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { AlertDialogAction } from "reka-ui";
import { cn } from "@/lib/utils";
import type { ButtonVariants } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";

const props = defineProps<
  AlertDialogActionProps & {
    class?: HTMLAttributes["class"];
    /*
     * Aperture change: a `variant` passthrough. The confirm button needs to be
     * destructive without hand-writing `bg-destructive` over the top — the face
     * is a `background-image`, so a `background-color` override loses to it and
     * the button silently comes out the ordinary colour.
     */
    variant?: ButtonVariants["variant"];
  }
>();

const delegatedProps = reactiveOmit(props, "class", "variant");
</script>

<template>
  <AlertDialogAction v-bind="delegatedProps" :class="cn(buttonVariants({ variant }), props.class)">
    <slot />
  </AlertDialogAction>
</template>
