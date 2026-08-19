import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Tailwind-merge with the project-specific typography utilities
 * registered as font-size (NOT text-color) classes. Without this, twMerge
 * treats `text-body`, `text-label`, `text-button`, `text-title-card`,
 * `text-title-page` as conflicting with `text-white` / `text-fg-primary` /
 * etc. and silently drops the color class — leaving the body color
 * (#172033) inheriting onto the element, which fails WCAG AA contrast on
 * the primary/danger backgrounds.
 *
 * The token names here MUST match the `--text-*` declarations in
 * `src/app/globals.css` under `@theme`.
 */
const customTwMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["body", "label", "button", "title-card", "title-page"] }],
    },
  },
});

/** shadcn/ui helper: combine class names with Tailwind-aware dedup. */
export function cn(...inputs: ClassValue[]) {
  return customTwMerge(clsx(inputs));
}

/**
 * Active-path predicate for navigation. Pass `exact: true` for routes
 * that should only highlight on an exact match (e.g. /app's "My Work"
 * — we don't want every /app/* to highlight it).
 *
 *   isActivePath("/app/workspaces", "/app/workspaces/new")
 *     // true (startsWith)
 *   isActivePath("/app", "/app/workspaces", { exact: true })
 *     // false
 */
export function isActivePath(
  href: string,
  pathname: string,
  options: { exact?: boolean } = {},
): boolean {
  if (options.exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}
