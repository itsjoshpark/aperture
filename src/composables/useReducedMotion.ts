import { usePreferredReducedMotion } from "@vueuse/core";
import { computed, watchEffect } from "vue";

/**
 * Single switch for every animation in the app.
 *
 * Puts `.motion-reduce` on `<html>`, which `index.css` uses to collapse all the
 * motion custom properties to nothing. JS-driven animations read `enabled`
 * instead of duplicating the media query.
 */
export function useReducedMotion() {
  const preference = usePreferredReducedMotion();
  const enabled = computed(() => preference.value !== "reduce");

  watchEffect(() => {
    document.documentElement.classList.toggle("motion-reduce", !enabled.value);
  });

  return {
    /** False when the OS asks for reduced motion. */
    enabled,
    /** `ms` normally, 0 when motion is reduced. */
    duration: (ms: number) => (enabled.value ? ms : 0),
  };
}

export function wait(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
}
