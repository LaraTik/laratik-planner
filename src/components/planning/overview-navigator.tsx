"use client";

import * as React from "react";
import { OverviewCommandCenter, type OverviewCommandCenterProps } from "./overview-command-center";
import { useLocaleT } from "@/components/i18n/locale-provider";

/**
 * OverviewNavigator — thin client wrapper that supplies
 * `onReadinessNavigate` to `OverviewCommandCenter`.
 *
 * Why a wrapper?
 *   The planning detail page is a Server Component for data
 *   fetching; the Overview is a client component. The
 *   readiness row click handler needs DOM access (it scrolls
 *   to a sub-anchor) and must run inside a Client Component.
 *   Hosting the callback here means the page can render the
 *   Overview with no prop drilling — the navigator owns the
 *   scroll + tab-switch flow on its own.
 *
 * The scroll + tab-switch flow:
 *   1. The readiness row's button fires `onReadinessNavigate(href)`.
 *   2. We update the URL hash; `WorkspaceShell` listens for
 *      `hashchange` and switches the active tab in response.
 *   3. After a short tick (so the just-mounted panel can
 *      lay out), we scroll the sub-anchor into view and
 *      move keyboard focus to the first interactive
 *      element in that section.
 *
 * The single source of truth is still `window.location.hash`,
 * so deep-links (`/planning/[id]#publishing`) and the
 * back/forward buttons keep working unchanged.
 *
 * Phase 1 of the planning-workspace-v2 refactor (2026-08-30).
 */
export type OverviewNavigatorProps = OverviewCommandCenterProps;

export function OverviewNavigator(props: OverviewNavigatorProps) {
  const localeT = useLocaleT();
  const handleNavigate = React.useCallback((href: string) => {
    if (typeof window === "undefined") return;
    const anchor = href.startsWith("#") ? href : `#${href}`;
    const hashChanged = window.location.hash !== anchor;
    // Update the URL hash via a synthetic `hashchange` so the
    // existing `WorkspaceShell` listener picks it up and
    // switches the tab. We use `replaceState` to avoid
    // piling up history entries when the user clicks
    // multiple readiness rows in a row, then dispatch
    // `hashchange` manually because `replaceState` does not
    // fire it on its own.
    try {
      if (hashChanged) {
        window.history.replaceState(null, "", anchor);
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      }
    } catch {
      // Some test environments disable history — fall back
      // to the default behaviour (the row's <Link> would
      // have worked, so we just bail).
      return;
    }
    // Defer the scroll + focus to the next frame so the
    // freshly mounted panel can lay out. `requestAnimationFrame`
    // is a single frame; 50ms is a safety margin for slow
    // browsers / test environments.
    const id = anchor.slice(1);
    const tryFocus = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        // Move keyboard focus to the first interactive
        // child of the section so the next Tab key keeps
        // the user inside the target area. Falls back to
        // making the section itself focusable.
        const focusable = el.querySelector<HTMLElement>(
          'input,textarea,select,button,[tabindex]:not([tabindex="-1"])',
        );
        (focusable ?? el).focus({ preventScroll: true });
      }
    };
    window.requestAnimationFrame(() => window.setTimeout(tryFocus, 50));
  }, []);
  return (
    <OverviewCommandCenter {...props} t={props.t ?? localeT} onReadinessNavigate={handleNavigate} />
  );
}
