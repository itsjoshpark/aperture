import type { useReducedMotion } from "./useReducedMotion";

/**
 * Opens and closes the large view by growing the image out of the thumbnail you
 * selected, rather than cross-fading a new layer over the top. It is the one
 * moment in the app where a transition carries meaning: it says *this* photo,
 * the one you were looking at, is the one now filling the screen.
 *
 * If the origin thumbnail cannot be measured — the image has not decoded, or the
 * tile has been scrolled away — it degrades to a plain fade rather than
 * animating from a bogus rectangle.
 */

const DURATION = 240;
const EASING = "cubic-bezier(0.2, 0, 0, 1)";

export function useLargeViewTransition(
  motion: ReturnType<typeof useReducedMotion>,
  originRect: () => DOMRect | null,
) {
  function onEnter(element: Element, done: () => void): void {
    const duration = motion.duration(DURATION);
    element.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: EASING });

    const image = element.querySelector("[data-large-image]");
    const from = originRect();
    if (image && from) animateImage(image, from, "in", duration);

    window.setTimeout(done, duration);
  }

  function onLeave(element: Element, done: () => void): void {
    const duration = motion.duration(DURATION);
    element.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration,
      easing: EASING,
      fill: "forwards",
    });

    const image = element.querySelector("[data-large-image]");
    const to = originRect();
    if (image && to) animateImage(image, to, "out", duration);

    window.setTimeout(done, duration);
  }

  return { onEnter, onLeave };
}

function animateImage(
  image: Element,
  thumbnail: DOMRect,
  direction: "in" | "out",
  duration: number,
): void {
  const full = image.getBoundingClientRect();
  if (full.width === 0 || full.height === 0) return;

  // Scale by width alone: both the tile and the large view letterbox with
  // `object-contain`, so the visible image has the same aspect ratio in each and
  // matching the widths matches the picture.
  const scale = thumbnail.width / full.width;
  const dx = thumbnail.left + thumbnail.width / 2 - (full.left + full.width / 2);
  const dy = thumbnail.top + thumbnail.height / 2 - (full.top + full.height / 2);

  const collapsed = { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.4 };
  const expanded = { transform: "translate(0px, 0px) scale(1)", opacity: 1 };

  image.animate(direction === "in" ? [collapsed, expanded] : [expanded, collapsed], {
    duration,
    easing: EASING,
    fill: "forwards",
  });
}
