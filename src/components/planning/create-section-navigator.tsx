"use client";

import * as React from "react";
import { List } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CreateSectionNavigatorProps {
  label: string;
  sections: ReadonlyArray<{ id: string; label: string }>;
  workspaceHash?: "#create" | "#publish";
  testId?: string;
}

/**
 * Compact in-page navigation for the Create and Publish workspaces. Each
 * panel is one task surface, so these links switch to its workspace when
 * needed and then scroll to the requested section after it becomes visible.
 */
export function CreateSectionNavigator({
  label,
  sections,
  workspaceHash = "#create",
  testId = "create-section-navigator",
}: CreateSectionNavigatorProps) {
  const navigate = React.useCallback(
    (id: string) => {
      if (typeof window === "undefined") return;
      const targetHash = workspaceHash;
      if (window.location.hash !== targetHash) {
        window.history.pushState(null, "", targetHash);
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      }

      const scrollToSection = () => {
        const section = document.getElementById(id);
        if (!section || section.closest("[hidden]") !== null) return;
        const reduceMotion =
          window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
        section.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        section.focus({ preventScroll: true });
      };

      window.requestAnimationFrame(() => window.setTimeout(scrollToSection, 50));
    },
    [workspaceHash],
  );

  return (
    <nav
      aria-label={label}
      data-testid={testId}
      className="border-border bg-surface/95 sticky top-16 z-10 flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] border px-3 py-2 shadow-sm backdrop-blur-sm"
    >
      <span className="text-label text-fg-secondary inline-flex items-center gap-1.5 font-semibold">
        <List className="text-fg-muted h-4 w-4" aria-hidden="true" />
        {label}
      </span>
      <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                navigate(section.id);
              }}
              className={cn(
                "text-label border-border bg-surface text-fg-secondary hover:border-primary hover:bg-primary-subtle hover:text-primary focus-visible:ring-focus-ring inline-flex min-h-11 items-center rounded-full border px-3 font-semibold transition-colors focus:outline-none focus-visible:ring-2",
              )}
              data-testid={`create-section-nav-${section.id}`}
            >
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
