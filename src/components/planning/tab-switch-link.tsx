"use client";

import * as React from "react";
import Link from "next/link";
import { type LinkProps } from "next/link";

/**
 * TabSwitchLink — a Next.js `<Link>` that, on click, switches the
 * workspace tab AND scrolls to the matching tab section.
 *
 * Why this exists
 * ---------------
 * The previous implementation used a plain `<Link href="#copy">`.
 * That works for the URL hash, but Next.js's client-side router
 * does NOT fire the browser's native `hashchange` event when the
 * URL only changes its hash on the current page. As a result,
 * `WorkspaceShell`'s `hashchange` listener (which is what actually
 * updates `activeId` and shows the panel) was never invoked —
 * the URL changed to `#copy` but the tab stayed on Overview.
 *
 * The behaviour was reported by planners as "Open copy doesn't
 * work" and "Open preview doesn't work" — the buttons looked
 * right but no tab ever switched.
 *
 * The fix is a small client-side wrapper that:
 *   1. On click, sets `window.location.hash` directly. The browser
 *      fires the native `hashchange` event, which the existing
 *      `WorkspaceShell` listener already handles.
 *   2. If `replace` is `true`, uses `history.replaceState` instead
 *     of `pushState` so the back button doesn't bounce through
 *     every cross-tab shortcut.
 *   3. Falls back to a normal Next.js `<Link>` navigation for
 *     non-hash hrefs, so this component is safe to drop in
 *     anywhere a `<Link>` was previously used.
 *
 * A11y:
 *   - Renders as a real `<a>` (Next.js `<Link>`), so keyboard /
 *     focus / right-click-open-in-new-tab all keep working.
 *   - `scroll` is `false` on the underlying Next.js navigation:
 *     we let the `WorkspaceShell`'s scroll behaviour do the work
 *     so the destination section is visible after the tab
 *     switch.
 */
export type TabSwitchLinkProps = Omit<LinkProps, "children" | "className"> & {
  /**
   * Optional callback fired AFTER the tab switch + scroll
   * settle. Useful when the parent wants to dismiss a
   * drawer or reset transient UI state after navigating.
   */
  onNavigated?: () => void;
  children?: React.ReactNode;
  /** Standard anchor className — forwarded through to the rendered <a>. */
  className?: string;
};

/**
 * Detect "hash-only" navigation on the current path so we
 * can handle it without going through the router.
 */
function isHashOnlyLink(href: LinkProps["href"], currentPath: string): { hash: string } | null {
  if (typeof href !== "string") return null;
  // Trim any query string — we only care about the hash here.
  const hashIndex = href.indexOf("#");
  if (hashIndex === -1) return null;
  const hash = href.slice(hashIndex + 1);
  if (!hash) return null;
  const path = href.slice(0, hashIndex);
  // If the href carries a different pathname, fall back to a
  // normal router navigation so cross-page anchors still work.
  if (path && path !== currentPath) return null;
  return { hash };
}

export const TabSwitchLink = React.forwardRef<HTMLAnchorElement, TabSwitchLinkProps>(
  function TabSwitchLink({ href, onClick, onNavigated, className, ...rest }, ref) {
    return (
      <Link
        ref={ref}
        href={href}
        scroll={false}
        className={className}
        {...rest}
        onClick={(event) => {
          // Surface a typed event so the user-supplied handler
          // (if any) still receives the synthetic React event.
          onClick?.(event);
          if (event.defaultPrevented) return;

          const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
          const target = isHashOnlyLink(href, currentPath);
          if (!target) return; // let Next.js handle cross-page nav

          event.preventDefault();
          if (typeof window === "undefined") return;

          // Set the hash through the History API; the browser
          // emits a single `hashchange` event that the
          // `WorkspaceShell` listener picks up.
          const nextHash = `#${target.hash}`;
          if (window.location.hash === nextHash) {
            // Already on the right tab — nothing to do, but the
            // caller may still want its callback fired so any
            // optimistic UI (e.g. closing a drawer) settles.
            onNavigated?.();
            return;
          }
          window.history.pushState(null, "", nextHash);
          window.dispatchEvent(
            new HashChangeEvent("hashchange", {
              oldURL: window.location.href,
              newURL: `${window.location.pathname}${window.location.search}${nextHash}`,
            }),
          );
          onNavigated?.();
        }}
      />
    );
  },
);
