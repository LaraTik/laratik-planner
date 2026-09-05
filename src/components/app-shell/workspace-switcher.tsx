"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Briefcase, Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getWorkspaceSwitchPath } from "./workspace-switcher-path";

type Workspace = { id: string; name: string; slug: string };

export type WorkspaceSwitcherCopy = {
  activeAria: string;
  selectAria: string;
  selectWorkspace: string;
  noWorkspacesAria: string;
  createFirst: string;
  switchTitle: string;
  listAria: string;
  noWorkspacesYet: string;
  newWorkspace: string;
};

const DEFAULT_COPY: WorkspaceSwitcherCopy = {
  activeAria: "Active workspace: {name}. Click to switch.",
  selectAria: "Select a workspace. Click to open.",
  selectWorkspace: "Select workspace",
  noWorkspacesAria: "No workspaces",
  createFirst: "Create your first workspace",
  switchTitle: "Switch workspace",
  listAria: "Workspaces",
  noWorkspacesYet: "No workspaces yet.",
  newWorkspace: "New workspace",
};

function withName(template: string, name: string) {
  return template.replace("{name}", name);
}

/**
 * Workspace switcher — opens a popover listing the user's workspaces
 * (or all agency workspaces for admins), with a "+ New workspace"
 * affordance and a keyboard-friendly popover (arrow keys + Enter +
 * Escape).
 *
 * The popover is Radix-powered and portal-mounted, so it escapes any
 * `overflow: hidden` / stacking-context ancestor that would otherwise
 * clip the menu (the original `position: absolute` popover was hidden
 * behind the topbar/sidebar's clip boundary).
 *
 * Server-renders the workspace list as a prop, so the initial paint
 * is instant; the popover only opens on user interaction.
 */
export function WorkspaceSwitcher({
  active,
  options,
  canCreate,
  compact = false,
  testId,
  copy = DEFAULT_COPY,
}: {
  active: Workspace | null;
  options: Workspace[];
  canCreate: boolean;
  compact?: boolean;
  testId?: string;
  copy?: WorkspaceSwitcherCopy;
}) {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // When the popover opens, jump activeIndex to the current workspace
  // (so arrow-key navigation starts at the highlighted row, not index 0).
  // Done in onOpenChange rather than a useEffect to avoid the
  // react-hooks/set-state-in-effect lint rule (synchronous setState
  // inside an effect causes cascading renders).
  const onPopoverOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      const idx = options.findIndex((w) => w.id === active?.id);
      setActiveIndex(idx >= 0 ? idx : 0);
    }
    setOpen(nextOpen);
  };

  // PopoverContent auto-focuses the first tabbable child on open. The
  // listbox is the only tabbable element above the "New workspace"
  // footer link, so Radix's default focus lands on the listbox and our
  // arrow-key handlers receive keypresses immediately. We override the
  // auto-focus to be explicit (and to keep the focus visible — the
  // listbox is the thing the user is interacting with).
  const onOpenAutoFocus = (e: Event) => {
    e.preventDefault();
    listRef.current?.focus();
  };

  const choose = (w: Workspace) => {
    setOpen(false);
    router.push(getWorkspaceSwitchPath(pathname, w.slug));
  };

  const onListKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const w = options[activeIndex];
      if (w) choose(w);
    }
  };

  if (!active && options.length === 0) {
    return (
      <Link
        href="/app/workspaces/new"
        className="text-body text-fg-primary hover:bg-surface-subtle focus-visible:ring-focus-ring inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-3 py-1.5 font-semibold focus:outline-none focus-visible:ring-2"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {copy.createFirst}
      </Link>
    );
  }

  return (
    <Popover open={open} onOpenChange={onPopoverOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={active ? withName(copy.activeAria, active.name) : copy.selectAria}
          data-testid={testId}
          className={cn(
            "text-body text-fg-primary hover:bg-surface-subtle focus-visible:ring-focus-ring data-[state=open]:bg-surface-subtle inline-flex min-h-11 w-full min-w-11 items-center gap-2 rounded-[var(--radius-control)] px-3 py-1.5 font-semibold focus:outline-none focus-visible:ring-2",
            compact ? "justify-center xl:justify-start" : "justify-start",
          )}
        >
          <span className="bg-primary-subtle text-primary flex h-6 w-6 items-center justify-center rounded font-bold">
            {active ? active.name.charAt(0).toUpperCase() : <Briefcase className="h-3.5 w-3.5" />}
          </span>
          <span className={compact ? "hidden xl:inline" : "inline"}>
            {active?.name ?? copy.selectWorkspace}
          </span>
          <ChevronsUpDown
            className={cn("text-fg-muted h-3.5 w-3.5", compact && "hidden xl:block")}
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        onOpenAutoFocus={onOpenAutoFocus}
        className="p-0"
      >
        <div
          className="border-border bg-surface overflow-hidden rounded-[var(--radius-card)]"
          role="presentation"
        >
          <div className="text-label text-fg-muted border-border border-b px-3 py-2 font-semibold tracking-wide uppercase">
            {copy.switchTitle}
          </div>
          <ul
            ref={listRef}
            role="listbox"
            aria-label={copy.listAria}
            aria-activedescendant={
              options[activeIndex] ? `ws-${options[activeIndex]!.id}` : undefined
            }
            tabIndex={0}
            onKeyDown={onListKeyDown}
            className="max-h-72 overflow-y-auto py-1 focus:outline-none"
          >
            {options.length === 0 ? (
              <li className="text-body text-fg-muted px-3 py-2">{copy.noWorkspacesYet}</li>
            ) : (
              options.map((w, i) => {
                const isActive = active?.id === w.id;
                const isHighlighted = i === activeIndex;
                return (
                  <li
                    key={w.id}
                    id={`ws-${w.id}`}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={cn(
                      "text-body flex cursor-pointer items-center gap-2 px-3 py-2 transition-colors",
                      isHighlighted && "bg-surface-subtle",
                    )}
                    onClick={() => choose(w)}
                  >
                    <span className="bg-primary-subtle text-primary flex h-6 w-6 shrink-0 items-center justify-center rounded font-bold">
                      {w.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{w.name}</span>
                    {isActive ? (
                      <Check className="text-primary h-4 w-4 shrink-0" aria-hidden="true" />
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
          {canCreate ? (
            <div className="border-border border-t p-1.5">
              <PopoverClose asChild>
                <Link
                  href="/app/workspaces/new"
                  className="text-body text-fg-primary hover:bg-surface-subtle flex items-center gap-2 rounded-[var(--radius-control)] px-2.5 py-1.5 font-semibold"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {copy.newWorkspace}
                </Link>
              </PopoverClose>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
