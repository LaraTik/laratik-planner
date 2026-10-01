"use client";

import * as React from "react";

/**
 * Scroll-spy active id — the canonical "which section is the user
 * currently looking at" hook.
 *
 * Two parallel signals run together:
 *
 *  1. **Scroll heuristic (primary)** — every `scroll` event runs a
 *     rAF-throttled pass that picks the section whose top has
 *     crossed ~30% of the viewport height. Owns the active state.
 *
 *  2. **IntersectionObserver (confirm)** — observes every section
 *     with `rootMargin: "-30% 0px -50% 0px"`. When a candidate
 *     fires, it can only PROMOTE the active state to a later
 *     section — never DEMOTE. This kills the active-state jitter
 *     that happens when two sections share the viewport.
 *
 * Hashchange stays as the deep-link bootstrap: when the URL
 * contains `#some-id`, the initial active id is that section
 * (if known), so a refresh / shared link lights up the right
 * row immediately.
 *
 * Round-4c extracted this hook from `src/components/workspace/
 * settings-sidebar.tsx` (which already shipped the same contract
 * in round 3) so the main sidebar's Settings branch can use the
 * same scroll-spy logic for the workspace `/settings` page.
 *
 * React deps contract: the effect depends on `items` only. The
 * `setActiveId` setter is stored in a ref so the effect does not
 * tear down + re-bind every time the active id changes (the bug
 * class the round-3 audit caught).
 */
export function useScrollSpyActiveId(items: { id: string }[]): string | null {
  // Keep the first render identical on the server and client. Apply the hash
  // after mount so deep links do not create a hydration mismatch.
  const [activeId, setActiveId] = React.useState<string | null>(items[0]?.id ?? null);

  // Stash the latest setter in a ref so the scroll + observer
  // effect can read it without depending on it.
  const setActiveIdRef = React.useRef(setActiveId);
  React.useEffect(() => {
    setActiveIdRef.current = setActiveId;
  }, [setActiveId]);

  React.useEffect(() => {
    function onHashChange() {
      const next = window.location.hash.replace(/^#/, "");
      if (next && items.some((t) => t.id === next)) {
        setActiveIdRef.current(next);
      }
    }
    onHashChange();
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [items]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const sections = items
      .map((t) => document.getElementById(t.id))
      .filter((el): el is HTMLElement => el !== null);

    if (sections.length === 0) return;

    const sectionOrder = new Map<string, number>();
    sections.forEach((s, idx) => sectionOrder.set(s.id, idx));

    const updateActive = (nextId: string, allowDemote: boolean) => {
      const setter = setActiveIdRef.current;
      setter((prev) => {
        if (prev === nextId) return prev;
        if (!allowDemote) {
          const prevIdx = prev ? sectionOrder.get(prev) : undefined;
          const nextIdx = sectionOrder.get(nextId);
          if (typeof prevIdx === "number" && typeof nextIdx === "number" && nextIdx < prevIdx) {
            return prev;
          }
        }
        return nextId;
      });
    };

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
          if (visible[0]) updateActive(visible[0].target.id, false);
        },
        { rootMargin: "-30% 0px -50% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
      );
      sections.forEach((s) => observer!.observe(s));
    }

    let rafId: number | null = null;
    function onScroll() {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        const triggerY = window.innerHeight * 0.3;
        let current: string | null = null;
        for (const section of sections) {
          const rect = section.getBoundingClientRect();
          if (rect.top - triggerY <= 0) {
            current = section.id;
          } else {
            break;
          }
        }
        if (current) updateActive(current, true);
      });
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      observer?.disconnect();
    };
  }, [items]);

  return activeId;
}
