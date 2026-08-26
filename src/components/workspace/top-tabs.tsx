"use client";
import * as React from "react";
import {
  BookOpen,
  History,
  Image as ImageIcon,
  Link as LinkIcon,
  type LucideIcon,
  MessageCircle,
  Palette,
  Sparkles,
  Tag,
  Type,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * WorkspaceTopTabs — horizontal anchor tab strip that replaces the
 * older per-page left-rail section nav.
 *
 * The Stitch-aligned Brand Kit page uses this strip just below the
 * PageHeader, with each tab linking to an in-page section via
 * `#{id}`. The active state is derived from the URL hash and is
 * also re-computed on scroll, so a long Bento grid stays in sync
 * as the user scrolls past a section.
 *
 * Accessibility:
 *   - Each tab is an `<a href="#id">` so deep links, middle-click,
 *     and screen-reader rotor work as expected.
 *   - The active tab carries `aria-current="true"`.
 *   - The strip has a `role="tablist"` only when `manual` activation
 *     semantics are needed; for plain anchor links we keep the
 *     `aria-label` on `<nav>` and let the browser handle focus.
 *   - Touch targets are 44px on all interactive elements (the
 *     10/16 padding + label height >= 44px on small viewports).
 *   - Smooth scroll is delegated to CSS `scroll-behavior: smooth`
 *     on `html`; the global `@media (prefers-reduced-motion)`
 *     override flips it back to `auto` automatically.
 *
 * Behaviour:
 *   - Initial active tab is the URL hash if it matches a known id;
 *     otherwise the first tab.
 *   - On `hashchange`, the active tab updates.
 *   - On scroll, the tab whose section is closest to the top of the
 *     viewport is marked active (debounced via `requestAnimationFrame`).
 *   - The `IntersectionObserver` fallback only attaches when the
 *     `observerRootMargin` prop is supplied (we don't need it on
 *     the brand-kit page; the scroll listener is plenty).
 *
 * **Icon contract (2026-08-27 fix):** tabs accept an `iconName`
 * (string) instead of an `icon` (React component). React Server
 * Components cannot serialise functions across the server→client
 * boundary; passing `LucideIcon` from a Server Component page to this
 * client component previously threw "Functions cannot be passed
 * directly to Client Components" and the whole page rendered as
 * the error boundary ("We hit an error rendering Brand Kit"). The
 * server passes a stable string from
 * `src/lib/brand/sections.ts`; this component looks up the real
 * icon in `WORKSPACE_TAB_ICONS`. Adding a new icon is a one-line
 * change in both places; the literal-type union in
 * `BrandKitIconName` is the source of truth for what's allowed.
 */
export const WORKSPACE_TAB_ICONS = {
  sparkles: Sparkles,
  image: ImageIcon,
  palette: Palette,
  type: Type,
  messageCircle: MessageCircle,
  tag: Tag,
  bookOpen: BookOpen,
  link: LinkIcon,
  history: History,
} as const satisfies Record<string, LucideIcon>;

export type WorkspaceTabIconName = keyof typeof WORKSPACE_TAB_ICONS;

export interface WorkspaceTopTab {
  id: string;
  label: string;
  iconName?: WorkspaceTabIconName;
  count?: number;
}

export interface WorkspaceTopTabsProps {
  tabs: WorkspaceTopTab[];
  /** `aria-label` for the `<nav>` element (required for a11y). */
  ariaLabel: string;
  /**
   * If provided, the active tab is also re-computed by an
   * IntersectionObserver against these section ids. Otherwise
   * the scroll-position heuristic is used.
   */
  observerRootMargin?: string;
  className?: string;
}

export function WorkspaceTopTabs({
  tabs,
  ariaLabel,
  observerRootMargin,
  className,
}: WorkspaceTopTabsProps) {
  const [activeId, setActiveId] = React.useState<string>(() => initialActiveId(tabs));

  // Hash sync — fires when the user clicks back/forward or pastes
  // a deep link with a new hash. We don't preventDefault on the
  // link click, so the browser scrolls to the anchor natively and
  // we only need to flip the active state.
  React.useEffect(() => {
    function onHashChange() {
      const next = window.location.hash.replace(/^#/, "");
      if (next && tabs.some((t) => t.id === next)) {
        setActiveId(next);
      }
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [tabs]);

  // Scroll spy — mark the tab whose section is nearest the top of
  // the viewport as active. We use IntersectionObserver when an
  // `observerRootMargin` is supplied (more accurate for sticky
  // headers); otherwise we fall back to a rAF-throttled scroll
  // handler that picks the last section whose top has crossed
  // 30% of the viewport height.
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const sections = tabs
      .map((t) => document.getElementById(t.id))
      .filter((el): el is HTMLElement => el !== null);

    if (sections.length === 0) return;

    if (observerRootMargin && typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver(
        (entries) => {
          // Pick the entry that is most "in view" (highest
          // intersection ratio). Ties go to the topmost.
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
          if (visible[0]) {
            setActiveId(visible[0].target.id);
          }
        },
        { rootMargin: observerRootMargin, threshold: [0, 0.25, 0.5, 0.75, 1] },
      );
      sections.forEach((s) => observer.observe(s));
      return () => observer.disconnect();
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
        if (current && current !== activeId) setActiveId(current);
      });
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [tabs, observerRootMargin, activeId]);

  return (
    <nav
      aria-label={ariaLabel}
      data-testid="workspace-top-tabs"
      className={cn(
        "border-border bg-surface sticky top-0 z-10 -mx-1 -mb-2 border-b backdrop-blur-sm",
        className,
      )}
    >
      <ul className="flex flex-wrap items-stretch gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          // iconName is a serialised string from the server; resolve
          // it to a real LucideIcon *here* (client) so the function
          // never crosses the RSC boundary. Unknown names render
          // without an icon — the literal-type union on the prop
          // means that can only happen if the source file and the
          // `WORKSPACE_TAB_ICONS` map are out of sync, which the
          // build (`pnpm typecheck`) catches.
          const Icon = tab.iconName ? WORKSPACE_TAB_ICONS[tab.iconName] : null;
          const isActive = tab.id === activeId;
          return (
            <li key={tab.id} className="shrink-0">
              <a
                href={`#${tab.id}`}
                aria-current={isActive ? "true" : undefined}
                data-testid={`workspace-top-tab-${tab.id}`}
                data-active={isActive || undefined}
                className={cn(
                  "text-body inline-flex min-h-11 items-center gap-2 border-b-2 px-3 py-2 font-semibold transition-colors",
                  "focus-visible:ring-focus-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                  isActive
                    ? "border-primary text-primary"
                    : "hover:text-fg-primary text-fg-secondary border-transparent",
                )}
              >
                {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
                <span>{tab.label}</span>
                {typeof tab.count === "number" ? (
                  <span
                    className={cn(
                      "text-label rounded-full px-1.5 py-0.5 font-mono tabular-nums",
                      isActive
                        ? "bg-primary-subtle text-primary"
                        : "bg-surface-subtle text-fg-muted",
                    )}
                  >
                    {tab.count}
                  </span>
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function initialActiveId(tabs: WorkspaceTopTab[]): string {
  if (typeof window === "undefined") return tabs[0]?.id ?? "";
  const hash = window.location.hash.replace(/^#/, "");
  if (hash && tabs.some((t) => t.id === hash)) return hash;
  return tabs[0]?.id ?? "";
}
