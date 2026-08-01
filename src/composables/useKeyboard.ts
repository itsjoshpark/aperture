import { useEventListener } from "@vueuse/core";
import type { Aperture } from "./useAperture";

/**
 * The app's keyboard map, dispatched on the current view.
 *
 * One rule is worth stating outright because it is easy to "fix" by mistake:
 * **Escape never clears the selection.** In the grid it leaves rename mode and
 * otherwise does nothing; in large view it goes back to the grid. Losing your
 * place in a folder of two thousand photos because you pressed Escape would be
 * its own small tragedy.
 */
export function useKeyboard(aperture: Aperture) {
  useEventListener(window, "keydown", (event: KeyboardEvent) => {
    if (!aperture.hasFolder.value) return;
    // Never steal keys from a control that has its own, or from an open dialog.
    if (handlesItsOwnKeys(event.target) || aperture.deleteDialogOpen.value) return;
    if (aperture.rename.applying.value) return;

    const inLargeView = aperture.gallery.view.value === "large";
    const reorderModifier = event.metaKey || event.ctrlKey;

    switch (event.key) {
      case "ArrowLeft":
      case "ArrowRight": {
        const direction = event.key === "ArrowLeft" ? "left" : "right";
        if (reorderModifier && !inLargeView) {
          void reorderSelected(aperture, direction === "left" ? -1 : 1);
        } else {
          aperture.moveSelectionBy(direction);
        }
        break;
      }

      case "ArrowUp":
      case "ArrowDown": {
        if (inLargeView) return; // vertical movement is meaningless on one image
        if (reorderModifier) {
          void reorderSelected(
            aperture,
            event.key === "ArrowUp" ? -aperture.columns.value : aperture.columns.value,
          );
        } else {
          aperture.moveSelectionBy(event.key === "ArrowUp" ? "up" : "down");
        }
        break;
      }

      case "Home":
        aperture.moveSelectionBy("home");
        break;

      case "End":
        aperture.moveSelectionBy("end");
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
        // Deliberately leaves the selection alone.
        if (inLargeView) aperture.closeLargeView();
        else aperture.exitRename();
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
 */
async function reorderSelected(aperture: Aperture, delta: number): Promise<void> {
  if (!aperture.rename.active.value) await aperture.enterRename();

  const from = aperture.selectedIndex.value;
  if (from < 0) return;

  const to = Math.min(Math.max(from + delta, 0), aperture.displayed.value.length - 1);
  if (to !== from) aperture.rename.move(from, to);
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
