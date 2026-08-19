import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn/ui helper: combine class names with Tailwind-aware dedup. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
