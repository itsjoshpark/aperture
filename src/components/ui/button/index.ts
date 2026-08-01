import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";

export { default as Button } from "./Button.vue";

/*
 * Aperture change: the variant axis is collapsed to one raised control face
 * (see `.control-face` in `assets/index.css`). Aperture has a single button
 * treatment on purpose, so shadcn's `ghost` / `outline` / `secondary` / `link`
 * no longer name anything distinct and are gone.
 *
 * Aperture change: focus is an `outline`, not shadcn's `ring-*`. Tailwind v4
 * draws rings with `box-shadow`, which is what the face uses for its lift — a
 * ring here would erase the button's depth, or be erased by it.
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-(--motion-fast) ease-(--motion-ease) disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  {
    variants: {
      variant: {
        default: "control-face",
        /*
         * Aperture change: the blue commit face, for the one button on a
         * surface that actually writes to disk. Not the same idea as shadcn's
         * `default` — this marks consequence, not visual weight.
         */
        primary: "control-face control-face-primary",
        destructive: "control-face control-face-destructive",
        /*
         * Aperture change: the documented way out of the system. The large
         * view's controls float over the photograph itself, where a raised
         * chrome-coloured pill would compete with the image.
         */
        overlay: "text-white hover:bg-white/10 hover:text-white",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
export type ButtonVariants = VariantProps<typeof buttonVariants>;
