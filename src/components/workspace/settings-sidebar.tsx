"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Vertical, in-page section navigation for the workspace Settings
 * overview. Mirrors the same scroll-spy contract as
 * `WorkspaceTopTabs` (horizontal strip used on Brand Kit) but
 * renders as a left rail so the user can always see "where I am"
 * while scrolling through long forms.
 *
 * The settings page is a single document with five
 * `<section id="…">` blocks (lifecycle, lead-times, defaults,
 * approvals, meta-publishing). This sidebar:
 *   - Highlights the section the user is currently inside.
 *   - Lets the user click to jump (with the URL hash updated so the
 *     active section survives a refresh / shared link).
 *   - Stays visible on the left on `lg+` viewports and collapses
 *     behind a dropdown / top-tabs on smaller screens.
 *
 * Accessibility:
 *   - Each link is an `<a href="#id">` — deep links, middle-click,
 *     and the screen-reader rotor all work natively.
 *   - The active link carries `aria-current="true"`.
 *   - The `<nav>` element gets an `aria-label` so assistive tech can
 *     disambiguate it from the main app sidebar.
 *   - Touch targets are 44px on all interactive elements (per the
 *     project's WCAG 2.2 AA target).
 *
 * Behaviour:
 *   - Initial active section is the URL hash if it matches a known
 *     id; otherwise the first section.
 *   - On `hashchange`, the active section updates.
 *   - On scroll, the section whose top has crossed ~30% of the
 *     viewport height is marked active (rAF-throttled to avoid
 *     layout thrash). An `IntersectionObserver` runs in parallel as
 *     a *confirm* (not a primary source) — it can only promote the
 *     scroll heuristic to a more visible section, never demote it,
 *     which kills the active-state jitter users saw when two
 *     sections were simultaneously visible.
 *   - The scroll + observer effect depends ONLY on `items`. The
 *     `setActiveId` setter is stored in a ref so the effect doesn't
 *     tear down + re-bind every time the active id changes (the
 *     bug class the round-3 audit caught).
 */
export interface SettingsSectionNavItem {
  id: string;
  label: string;
  description?: string;
  count?: number;
  /** Optional Lucide icon name. Currently only a small allowlist is
   * supported; pass a `string` from a literal-type union in the
   * caller to stay type-safe across the RSC boundary. */
  iconName?: string;
}

export interface SettingsSidebarProps {
  items: SettingsSectionNavItem[];
  /** `aria-label` for the `<nav>` element (required for a11y). */
  ariaLabel: string;
  /** Optional className for the root `<nav>`. */
  className?: string;
  /**
   * The list is rendered as a vertical sidebar on `lg+` and as a
   * horizontal chip strip below the page header on smaller
   * viewports. Set `variant="stack"` to render vertical-only
   * (useful when the parent layout already provides a column).
   */
  variant?: "auto" | "stack";
}

export function SettingsSidebar({
  items,
  ariaLabel,
  className,
  variant = "auto",
}: SettingsSidebarProps) {
  const [activeId, setActiveId] = React.useState<string>(() => initialActiveId(items));

  // Stash the latest setter in a ref so the scroll + observer effect
  // can read it without depending on it. This prevents the effect
  // from tearing down + re-binding on every active-id flip.
  // Without this, every time the user scrolled past a section
  // boundary, the IntersectionObserver disconnected, the scroll
  // listener was removed, and a fresh observer was attached — which
  // manifested as a visible active-state flicker on long pages.
  const setActiveIdRef = React.useRef(setActiveId);
  React.useEffect(() => {
    setActiveIdRef.current = setActiveId;
  }, [setActiveId]);

  React.useEffect(() => {
    function onHashChange() {
      const next = window.location.hash.replace(/^#/, "");
      if (next && items.some((t) => t.id === next)) {
        setActiveId(next);
      }
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [items]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const sections = items
      .map((t) => document.getElementById(t.id))
      .filter((el): el is HTMLElement => el !== null);

    if (sections.length === 0) return;

    // The scroll heuristic owns the active state. The
    // IntersectionObserver only fires when its candidate is
    // strictly *later* in the document order than the current
    // activeId — so it can PROMOTE the active state when the user
    // scrolls quickly, but never demote it (the demote case is
    // what produced the jitter).
    const sectionOrder = new Map<string, number>();
    sections.forEach((s, idx) => sectionOrder.set(s.id, idx));

    const updateActive = (nextId: string, allowDemote: boolean) => {
      const setter = setActiveIdRef.current;
      setter((prev) => {
        if (prev === nextId) return prev;
        if (!allowDemote) {
          const prevIdx = sectionOrder.get(prev);
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

  const isStack = variant === "stack";

  return (
    <nav
      aria-label={ariaLabel}
      data-testid="settings-sidebar"
      data-variant={variant}
      className={cn(
        isStack
          ? "flex flex-col gap-1"
          : "border-border bg-surface lg:sticky lg:top-20 lg:rounded-[var(--radius-card)] lg:border lg:p-2",
        className,
      )}
    >
      <ul
        className={cn(
          isStack
            ? "flex flex-col gap-1"
            : "flex gap-1 overflow-x-auto px-2 lg:flex-col lg:overflow-visible lg:px-0",
        )}
      >
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <li key={item.id} className={cn(isStack ? "" : "shrink-0 lg:shrink lg:grow-0")}>
              <a
                href={`#${item.id}`}
                aria-current={isActive ? "true" : undefined}
                data-testid={`settings-sidebar-link-${item.id}`}
                data-active={isActive || undefined}
                className={cn(
                  "focus-visible:ring-focus-ring group flex min-h-11 items-start gap-3 rounded-[var(--radius-control)] border px-3 py-2 transition-colors focus:outline-none focus-visible:ring-2",
                  "border-transparent",
                  isActive
                    ? "bg-primary-subtle text-primary border-primary/30"
                    : "text-fg-secondary hover:bg-surface-subtle hover:text-fg-primary",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="text-body flex items-center justify-between gap-2 font-semibold">
                    <span className="truncate">{item.label}</span>
                    {typeof item.count === "number" ? (
                      <span
                        className={cn(
                          "text-label rounded-full px-1.5 py-0.5 font-mono tabular-nums",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "bg-surface-subtle text-fg-muted",
                        )}
                      >
                        {item.count}
                      </span>
                    ) : null}
                  </span>
                  {item.description ? (
                    <span
                      className={cn(
                        "text-label mt-0.5 block truncate",
                        isActive ? "text-primary/80" : "text-fg-muted",
                      )}
                    >
                      {item.description}
                    </span>
                  ) : null}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function initialActiveId(items: SettingsSectionNavItem[]): string {
  if (typeof window === "undefined") return items[0]?.id ?? "";
  const hash = window.location.hash.replace(/^#/, "");
  if (hash && items.some((t) => t.id === hash)) return hash;
  return items[0]?.id ?? "";
}
