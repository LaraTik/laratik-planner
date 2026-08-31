"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { switchActiveAgencyAndRedirect } from "@/lib/auth/agency-actions";

/**
 * Row shape consumed by the agency switcher. Mirrors
 * `ActorAgency` from `src/lib/auth/agency-context.ts` so the RSC
 * data loader can pass the result directly without remapping.
 */
export type AgencyRow = { id: string; name: string; slug: string; isAdmin: boolean };

/**
 * Agency switcher — opens a popover listing every agency the user is
 * an active member of. Selecting a row:
 *   1. Calls the `switchActiveAgency` server action, which issues a
 *      fresh signed HttpOnly cookie via the M1.2 helper. The
 *      membership re-check inside the helper is the authorization
 *      gate (a non-member caller cannot switch).
 *   2. Navigates to the app home. Keeping the current workspace URL
 *      could carry a slug that belongs only to the previous agency;
 *      the neutral landing page lets the refreshed shell load the
 *      newly selected agency and its own workspace list safely.
 *
 * Visual pattern: mirrors `WorkspaceSwitcher` (Radix Popover +
 * keyboard-friendly listbox with `aria-activedescendant`). The
 * agency switcher is the outermost switcher in the sidebar
 * (above the workspace switcher) — the active agency scopes the
 * workspace list the user can pick from.
 */
export function AgencySwitcher({
  active,
  options,
  testId,
  isPlatformAdmin = false,
  compact = false,
}: {
  active: AgencyRow | null;
  options: AgencyRow[];
  testId?: string;
  isPlatformAdmin?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [pending, setPending] = React.useState(false);
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const router = useRouter();

  // When the popover opens, jump activeIndex to the current agency
  // (so arrow-key navigation starts at the highlighted row, not
  // index 0). Mirrors the WorkspaceSwitcher's `onOpenChange` pattern
  // to avoid the `react-hooks/set-state-in-effect` lint.
  const onPopoverOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      const idx = options.findIndex((a) => a.id === active?.id);
      setActiveIndex(idx >= 0 ? idx : 0);
    }
    setOpen(nextOpen);
  };

  // PopoverContent auto-focuses the first tabbable child on open.
  // Override so the listbox receives focus — that way arrow keys
  // are handled without an extra click.
  const onOpenAutoFocus = (e: Event) => {
    e.preventDefault();
    listRef.current?.focus();
  };

  const choose = async (a: AgencyRow) => {
    setOpen(false);
    if (a.id === active?.id) return; // no-op selection
    setPending(true);
    try {
      // Switch-and-redirect: the server action writes the cookie and
      // returns the first accessible workspace in the new agency. We
      // navigate to that workspace (or `/app` if the agency has none)
      // atomically so the URL never holds a workspace slug from the
      // previous agency. Going to `/app` was the v1 behavior; it
      // worked when there was only one agency on the deployment, but
      // with multi-agency it left the previous (now invalid)
      // workspace URL in the address bar until the next click, and
      // a browser-back could resurrect a cross-tenant URL.
      const result = await switchActiveAgencyAndRedirect(a.id);
      if (!result.ok) {
        // The server action refused (membership check failed or the
        // session expired). We keep the user on the current page;
        // the popover is already closed. A real production version
        // would surface a toast here. The state machine is left
        // simple for M1.5: the action's fail-closed contract is the
        // important guarantee.
        return;
      }
      const nextHref = result.firstWorkspaceSlug ? `/app/w/${result.firstWorkspaceSlug}` : "/app";
      router.push(nextHref);
      router.refresh();
    } finally {
      setPending(false);
    }
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
      const a = options[activeIndex];
      if (a) void choose(a);
    }
  };

  // No active agency AND no options: the user has no memberships.
  // Render a disabled trigger so the sidebar layout stays stable
  // (no layout shift when the user lands here) but the affordance
  // is clearly inert.
  if (!active && options.length === 0) {
    return (
      <button
        type="button"
        disabled
        aria-label="No agencies"
        className="text-body text-fg-muted inline-flex min-h-11 min-w-11 cursor-not-allowed items-center justify-center gap-2 rounded-[var(--radius-control)] px-3 py-1.5 font-semibold xl:justify-start"
      >
        <span className="bg-surface-subtle text-fg-muted flex h-6 w-6 items-center justify-center rounded font-bold">
          —
        </span>
        <span className={compact ? "hidden xl:inline" : "inline"}>No agency</span>
      </button>
    );
  }

  const display = active ?? options[0]!;

  return (
    <Popover open={open} onOpenChange={onPopoverOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`Active agency: ${display.name}. Click to switch.`}
          data-testid={testId}
          disabled={pending}
          className={cn(
            "text-body text-fg-primary hover:bg-surface-subtle focus-visible:ring-focus-ring data-[state=open]:bg-surface-subtle inline-flex min-h-11 min-w-11 items-center gap-2 rounded-[var(--radius-control)] px-3 py-1.5 font-semibold focus:outline-none focus-visible:ring-2 disabled:opacity-50",
            compact ? "justify-center xl:justify-start" : "justify-start",
          )}
        >
          <span className="bg-primary-subtle text-primary flex h-6 w-6 items-center justify-center rounded font-bold">
            {display.name.charAt(0).toUpperCase()}
          </span>
          <span className={compact ? "hidden xl:inline" : "inline"}>{display.name}</span>
          {display.isAdmin ? (
            <Shield
              className="text-primary h-3.5 w-3.5"
              aria-label="Agency admin"
              data-testid={testId ? `${testId}-admin-badge` : undefined}
            />
          ) : null}
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
            Switch agency
          </div>
          <ul
            ref={listRef}
            role="listbox"
            aria-label="Agencies"
            aria-activedescendant={
              options[activeIndex] ? `ag-${options[activeIndex]!.id}` : undefined
            }
            tabIndex={0}
            onKeyDown={onListKeyDown}
            className="max-h-72 overflow-y-auto py-1 focus:outline-none"
          >
            {options.length === 0 ? (
              <li className="text-body text-fg-muted px-3 py-2">No agencies yet.</li>
            ) : (
              options.map((a, i) => {
                const isActive = active?.id === a.id;
                const isHighlighted = i === activeIndex;
                return (
                  <li
                    key={a.id}
                    id={`ag-${a.id}`}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={cn(
                      "text-body flex cursor-pointer items-center gap-2 px-3 py-2 transition-colors",
                      isHighlighted && "bg-surface-subtle",
                    )}
                    onClick={() => void choose(a)}
                  >
                    <span className="bg-primary-subtle text-primary flex h-6 w-6 shrink-0 items-center justify-center rounded font-bold">
                      {a.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{a.name}</span>
                    {a.isAdmin ? (
                      <Shield
                        className="text-primary h-3.5 w-3.5 shrink-0"
                        aria-label="Agency admin"
                      />
                    ) : null}
                    {isActive ? (
                      <Check className="text-primary h-4 w-4 shrink-0" aria-hidden="true" />
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
          {isPlatformAdmin ? (
            <div className="border-border border-t p-1.5">
              <Link
                href="/app/platform/agencies"
                className="text-body text-fg-primary hover:bg-surface-subtle flex items-center gap-2 rounded-[var(--radius-control)] px-2.5 py-1.5 font-semibold"
                data-testid="agency-switcher-create"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create new agency
              </Link>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
