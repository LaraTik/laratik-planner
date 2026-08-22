"use client";

import * as React from "react";

/**
 * `useReducedMotion` — small React hook that tracks the user's
 * `prefers-reduced-motion` setting. Returns `true` when the user
 * has asked the OS to reduce motion (so animations and smooth
 * scrolling should be suppressed) and `false` otherwise.
 *
 * The hook listens to the `change` event on
 * `window.matchMedia("(prefers-reduced-motion: reduce)")` so the
 * value updates live when the user toggles the setting at the OS
 * level (e.g. macOS "Reduce motion" in Accessibility settings).
 *
 * The default value is computed lazily via a function-form
 * `useState` so we don't pay the cost of a cascading re-render
 * just to surface the OS preference on the first paint. On the
 * server the hook always returns `false` because there's no DOM
 * to read.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    function onChange(event: MediaQueryListEvent) {
      setReduced(event.matches);
    }
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
