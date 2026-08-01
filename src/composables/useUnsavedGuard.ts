import { useEventListener } from "@vueuse/core";
import { ref, type Ref } from "vue";

export type GuardedAction = () => void | Promise<void>;

/**
 * Stops an unapplied arrangement from being thrown away by accident.
 *
 * Two halves, and the second is the one that matters. `beforeunload` can only
 * produce the browser's own generic dialog — no custom text, no custom buttons —
 * so it is a blunt safety net for closing the tab. Everything that happens
 * *inside* the app routes through `attempt()`, which can actually explain what
 * is at stake and offer to apply the rename instead of losing it.
 */
export function useUnsavedGuard(dirty: Ref<boolean>) {
  const pending = ref<GuardedAction | null>(null);

  /**
   * Kept separate from `pending` because the dialog closes itself as part of
   * handling a button click: if closing also cleared the queued action, the
   * action would be gone by the time the click handler looked for it.
   */
  const open = ref(false);

  useEventListener(window, "beforeunload", (event: BeforeUnloadEvent) => {
    if (!dirty.value) return;
    event.preventDefault();
    // Chrome still wants a truthy returnValue to show its prompt.
    event.returnValue = "";
  });

  /**
   * Run `action` if there is nothing to lose, otherwise hold it and ask. The
   * caller shows `DiscardChangesDialog` whenever `open` is true.
   */
  async function attempt(action: GuardedAction): Promise<void> {
    if (!dirty.value) {
      await action();
      return;
    }
    pending.value = action;
    open.value = true;
  }

  async function proceed(): Promise<void> {
    const action = pending.value;
    pending.value = null;
    open.value = false;
    await action?.();
  }

  function dismiss(): void {
    open.value = false;
  }

  return { pending, open, attempt, proceed, dismiss };
}
