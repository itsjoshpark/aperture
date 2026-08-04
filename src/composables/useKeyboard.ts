import { useEventListener } from "@vueuse/core";
import { clamp } from "@/lib/grid-geometry";
import type { Aperture } from "./useAperture";

/**
 * The app's keyboard map, dispatched on the current view.
 *
 * Escape unwinds one layer at a time and the selection is the last of them: out
 * of the large view, then out of rename mode, and only with neither of those
 * left does it clear what is selected. Skipping a layer would throw away a
 * rename in progress on the way to deselecting a photo.
 */
export function useKeyboard(aperture: Aperture) {
  useEventListener(window, "keydown", (event: KeyboardEvent) => {
    // Opening a folder is the one binding that predates having one, so it is
    // handled ahead of every guard below — including `handlesItsOwnKeys`, since
    // unlike the arrows and Backspace this chord means nothing inside a text
    // field, and Chrome's own Cmd+O is not a useful thing to fall through to.
    if (isOpenFolderChord(event) && aperture.supported && !aperture.busy.value) {
      // Claimed before the bail-outs, so a modal never leaks the key to Chrome.
      event.preventDefault();
      if (aperture.deleteDialogOpen.value || aperture.guard.open.value) return;
      if (aperture.rename.applying.value) return;
      // Nothing may be awaited first: `showDirectoryPicker()` needs the user
      // activation this keydown carries, and the path to it is synchronous.
      void aperture.openFolder();
      return;
    }

    if (!aperture.hasFolder.value) return;
    // Never steal keys from a control that has its own, or from an open dialog.
    if (handlesItsOwnKeys(event.target) || aperture.deleteDialogOpen.value) return;
    if (aperture.rename.applying.value) return;

    const inLargeView = aperture.gallery.view.value === "large";
    const reorderModifier = event.metaKey || event.ctrlKey;
    // Extending a selection means nothing when only one photo is on screen.
    const extend = event.shiftKey && !reorderModifier && !inLargeView;

    switch (event.key) {
      case "ArrowLeft":
      case "ArrowRight": {
        const direction = event.key === "ArrowLeft" ? "left" : "right";
        if (reorderModifier && !inLargeView) {
          reorderSelected(aperture, direction === "left" ? -1 : 1);
        } else {
          aperture.moveSelectionBy(direction, extend);
        }
        break;
      }

      case "ArrowUp":
      case "ArrowDown": {
        if (inLargeView) return; // vertical movement is meaningless on one image
        if (reorderModifier) {
          reorderSelected(
            aperture,
            event.key === "ArrowUp" ? -aperture.columns.value : aperture.columns.value,
          );
        } else {
          aperture.moveSelectionBy(event.key === "ArrowUp" ? "up" : "down", extend);
        }
        break;
      }

      case "Home":
        aperture.moveSelectionBy("home", extend);
        break;

      case "End":
        aperture.moveSelectionBy("end", extend);
        break;

      case " ":
        if (inLargeView) aperture.closeLargeView();
        else aperture.openLargeView();
        break;

      case "Enter":
        if (!inLargeView) aperture.openLargeView();
        break;

      case "Delete":
      case "Backspace":
        aperture.askToDelete();
        break;

      case "Escape":
        if (inLargeView) aperture.closeLargeView();
        else if (aperture.rename.active.value) aperture.exitRename();
        else aperture.gallery.clearSelection();
        break;

      default:
        return;
    }

    event.preventDefault();
  });
}

/**
 * Keyboard reordering, so arranging images is not mouse-only. Entering rename
 * mode on the first press mirrors what dragging does.
 *
 * A selection of several moves as one run, gathered around the cursor on the
 * first press the same way a drag gathers it — otherwise each press would deal
 * the photos out one at a time and the arrangement would come apart.
 */
function reorderSelected(aperture: Aperture, delta: number): void {
  if (!aperture.rename.active.value) aperture.enterRename();

  const list = aperture.displayed.value;
  const carried = aperture.selectedEntries.value;
  if (carried.length === 0) return;

  const first = list.indexOf(carried[0]!);
  const contiguous = carried.every((entry, at) => list[first + at] === entry);
  const start = contiguous
    ? first
    : clamp(aperture.selectedIndex.value, 0, list.length - carried.length);

  const to = clamp(start + delta, 0, list.length - carried.length);
  if (contiguous && to === start) return;

  aperture.rename.moveRun(carried, to);
}

/**
 * `Cmd`/`Ctrl` + `O`, and nothing adjacent to it: `Shift` and `Alt` are left
 * free for whatever the browser or the OS has bound there, and a held key must
 * not queue a second picker behind the first.
 */
function isOpenFolderChord(event: KeyboardEvent): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.shiftKey &&
    !event.altKey &&
    !event.repeat &&
    event.key.toLowerCase() === "o"
  );
}

/**
 * Text fields want their own arrows and their own Backspace; so does a focused
 * slider, whose whole keyboard interface is the arrow keys. Without this the
 * size slider would resize the tiles *and* move the selection on one press.
 */
function handlesItsOwnKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.getAttribute("role") === "slider"
  );
}
