"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Check, ChevronsUpDown, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Agency-level Media workspace switcher.
 *
 * The previous `<AgencyWorkspaceChip>` was a static pill — clicking it
 * did nothing. The only path to switch workspaces was the sidebar's
 * `<WorkspaceSwitcher>`, which navigates to `/app/w/<slug>/media`
 * (the per-workspace route), dropping the user off the agency
 * `/app/media` URL and abandoning every active filter.
 *
 * This component supersedes the chip on the agency page header. It
 * is a portal-mounted popover that mirrors the visual rhythm and a11y
 * pattern of `<AgencySwitcher>` and `<WorkspaceSwitcher>` in the app
 * shell, but its action is a single `router.push(...)` — no API call,
 * no cookie write, no optimistic mutation.
 *
 * The popover always offers an "All workspaces" row whose value is
 * `""`. Selecting it strips `?workspace=` entirely and reuses the
 * existing cross-workspace query path on
 * `src/app/(app)/app/media/page.tsx`.
 *
 * Preserved filters on every switch: `q`, `kind`, `trash`, `view`,
 * `folder`, `shared`, `sort`, `page`. The selection store's
 * `?selected=...` is intentionally dropped because cross-workspace
 * selection is meaningless.
 */
export type MediaAgencyWorkspaceOption = {
  id: string;
  name: string;
  slug: string;
};

export function MediaAgencyWorkspaceSwitcher({
  active,
  options,
  basePath,
  preserveParams,
  t,
}: {
  active: MediaAgencyWorkspaceOption | null;
  options: MediaAgencyWorkspaceOption[];
  basePath: string;
  preserveParams: Record<string, string>;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const router = useRouter();

  // Prepend "All workspaces" as a synthetic option. The empty string
  // matches the page.tsx convention where `selectedWorkspaceId === ""`
  // means "no workspace filter" (cross-workspace mode).
  const allOptions: Array<{ id: ""; name: string } | MediaAgencyWorkspaceOption> = [
    { id: "", name: t("media.agencyWorkspace.all") },
    ...options,
  ];

  // On open, jump the keyboard cursor to the currently-active option
  // so arrow-key nav starts on the highlighted row, not index 0.
  // Mirrors AgencySwitcher.onPopoverOpenChange.
  const onPopoverOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      const idx = allOptions.findIndex((option) =>
        option.id === "" ? active === null : active !== null && option.id === active.id,
      );
      setActiveIndex(idx >= 0 ? idx : 0);
    }
    setOpen(nextOpen);
  };

  // Override Radix's auto-focus so the listbox (not the first
  // tabbable descendant) receives focus — that's what enables
  // arrow-key selection without an extra click.
  const onOpenAutoFocus = (e: Event) => {
    e.preventDefault();
    listRef.current?.focus();
  };

  // Build the destination URL preserving every stable filter.
  // `?workspace=` is set explicitly; `?selected=` is intentionally
  // omitted because a workspace switch should not leak selection.
  const buildHref = React.useCallback(
    (workspaceId: string): string => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(preserveParams)) {
        params.set(key, value);
      }
      if (workspaceId) params.set("workspace", workspaceId);
      return `${basePath}?${params.toString()}`;
    },
    [basePath, preserveParams],
  );

  const choose = (optionId: string) => {
    setOpen(false);
    // No-op if the same option is already active.
    const isCurrentlyActive =
      optionId === "" ? active === null : active !== null && active.id === optionId;
    if (isCurrentlyActive) return;
    router.push(buildHref(optionId));
  };

  const onListKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, allOptions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(allOptions.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = allOptions[activeIndex];
      if (option) choose(option.id);
    }
  };

  // Empty state: zero writable workspaces at all. Render a disabled
  // placeholder so the header layout stays stable. Mirrors the
  // AgencySwitcher behaviour when the user belongs to no agency.
  if (options.length === 0) {
    return (
      <button
        type="button"
        disabled
        aria-label={t("media.agencyWorkspace.noWorkspacesAria")}
        data-testid="media-agency-workspace-switcher-empty"
        className="text-body text-fg-muted inline-flex min-h-11 cursor-not-allowed items-center gap-2 rounded-[var(--radius-control)] border border-dashed border-[color:var(--border)] px-3 py-1.5 font-semibold"
      >
        <Briefcase className="h-4 w-4" aria-hidden="true" />
        <span>{t("media.agencyWorkspace.all")}</span>
      </button>
    );
  }

  // Single-workspace fallback: one real workspace means the only
  // useful row is "All workspaces". Render the workspace name as a
  // static badge instead of a two-row popover with no real choice.
  if (options.length === 1) {
    return (
      <div
        data-testid="media-agency-workspace-switcher-single"
        className="border-border bg-surface-subtle text-fg-primary inline-flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-semibold"
      >
        <Briefcase className="text-fg-muted h-4 w-4" aria-hidden="true" />
        <span className="truncate">{active?.name ?? options[0]?.name ?? "—"}</span>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={onPopoverOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={
            active
              ? t("media.agencyWorkspace.selectActiveAria", { name: active.name })
              : t("media.agencyWorkspace.selectAria")
          }
          data-testid="media-agency-workspace-switcher-trigger"
          className={cn(
            "text-body text-fg-primary border-border bg-surface hover:bg-surface-subtle focus-visible:ring-focus-ring data-[state=open]:bg-surface-subtle inline-flex min-h-11 max-w-full items-center gap-2 rounded-[var(--radius-control)] border px-3 py-1.5 font-semibold focus:outline-none focus-visible:ring-2",
          )}
        >
          <Briefcase className="text-fg-muted h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">{active?.name ?? t("media.agencyWorkspace.all")}</span>
          <ChevronsUpDown className="text-fg-muted ms-auto h-4 w-4 shrink-0" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        onOpenAutoFocus={onOpenAutoFocus}
        className="w-80 p-0"
      >
        <div className="border-border bg-surface overflow-hidden rounded-[var(--radius-card)] border">
          <div className="text-label text-fg-muted border-border border-b px-3 py-2 font-semibold tracking-wide uppercase">
            {t("media.agencyWorkspace.label")}
          </div>
          <ul
            ref={listRef}
            role="listbox"
            aria-label={t("media.agencyWorkspace.label")}
            aria-activedescendant={
              allOptions[activeIndex]?.id !== undefined
                ? `mws-${
                    allOptions[activeIndex]!.id === ""
                      ? "all"
                      : (allOptions[activeIndex] as MediaAgencyWorkspaceOption).id
                  }`
                : undefined
            }
            tabIndex={0}
            onKeyDown={onListKeyDown}
            data-testid="media-agency-workspace-switcher-list"
            className="max-h-72 overflow-y-auto py-1 focus:outline-none"
          >
            {allOptions.map((option, i) => {
              const isAllOption = option.id === "";
              const isActive = isAllOption
                ? active === null
                : active !== null && option.id === active.id;
              const isHighlighted = i === activeIndex;
              const domId = isAllOption ? "mws-all" : `mws-${option.id}`;
              return (
                <li
                  key={option.id || "all"}
                  id={domId}
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    "text-body flex cursor-pointer items-center gap-2 px-3 py-2 transition-colors",
                    isHighlighted && "bg-surface-subtle",
                  )}
                  data-testid={`media-agency-workspace-option-${isAllOption ? "all" : option.id}`}
                  onClick={() => choose(option.id)}
                >
                  {isAllOption ? (
                    <Layers className="text-fg-muted h-4 w-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <Briefcase className="text-fg-muted h-4 w-4 shrink-0" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1 truncate font-semibold">{option.name}</span>
                  {isActive ? (
                    <Check className="text-primary h-4 w-4 shrink-0" aria-hidden="true" />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}
