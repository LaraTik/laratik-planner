"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type Workspace = { id: string; name: string; slug: string };

/**
 * Workspace switcher — opens a popover listing the user's workspaces
 * (or all agency workspaces for admins), with a "+ New workspace"
 * affordance and a keyboard-friendly popover (arrow keys + Enter +
 * Escape).
 *
 * Server-renders the workspace list as a prop, so the initial paint
 * is instant; the popover only opens on user interaction.
 */
export function WorkspaceSwitcher({
  active,
  options,
  canCreate,
  testId,
}: {
  active: Workspace | null;
  options: Workspace[];
  canCreate: boolean;
  testId?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Close on outside click + Escape
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        listRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Focus the active item when the popover opens
  React.useEffect(() => {
    if (open && listRef.current) {
      const idx = options.findIndex((w) => w.id === active?.id);
      setActiveIndex(idx >= 0 ? idx : 0);
    }
  }, [open, options, active?.id]);

  const choose = (w: Workspace) => {
    setOpen(false);
    // If the user is on a workspace-scoped page, swap the slug; otherwise
    // go to the workspace overview.
    const isWorkspacePage = /^\/app\/w\/[^/]+/.test(pathname);
    router.push(
      isWorkspacePage
        ? pathname.replace(/^\/app\/w\/[^/]+/, `/app/w/${w.slug}`)
        : `/app/w/${w.slug}`,
    );
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

  if (!active) {
    return (
      <Link
        href="/app/workspaces/new"
        className="text-body text-fg-primary hover:bg-surface-subtle focus-visible:ring-focus-ring inline-flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-1.5 font-semibold focus:outline-none focus-visible:ring-2"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Create your first workspace
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Active workspace: ${active.name}. Click to switch.`}
        data-testid={testId}
        className="text-body text-fg-primary hover:bg-surface-subtle focus-visible:ring-focus-ring inline-flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-1.5 font-semibold focus:outline-none focus-visible:ring-2"
      >
        <span className="bg-primary-subtle text-primary flex h-6 w-6 items-center justify-center rounded font-bold">
          {active.name.charAt(0).toUpperCase()}
        </span>
        <span className="hidden sm:inline">{active.name}</span>
        <ChevronsUpDown className="text-fg-muted h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {open ? (
        <div
          className="border-border bg-surface absolute left-0 z-50 mt-1.5 w-72 overflow-hidden rounded-[var(--radius-card)] border shadow-lg"
          role="presentation"
        >
          <div className="text-label text-fg-muted border-border border-b px-3 py-2 font-semibold tracking-wide uppercase">
            Switch workspace
          </div>
          <ul
            ref={listRef}
            role="listbox"
            aria-label="Workspaces"
            aria-activedescendant={
              options[activeIndex] ? `ws-${options[activeIndex]!.id}` : undefined
            }
            tabIndex={0}
            onKeyDown={onListKeyDown}
            className="max-h-72 overflow-y-auto py-1 focus:outline-none"
          >
            {options.length === 0 ? (
              <li className="text-body text-fg-muted px-3 py-2">No workspaces yet.</li>
            ) : (
              options.map((w, i) => {
                const isActive = active.id === w.id;
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
              <Link
                href="/app/workspaces/new"
                onClick={() => setOpen(false)}
                className="text-body text-fg-primary hover:bg-surface-subtle flex items-center gap-2 rounded-[var(--radius-control)] px-2.5 py-1.5 font-semibold"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                New workspace
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
