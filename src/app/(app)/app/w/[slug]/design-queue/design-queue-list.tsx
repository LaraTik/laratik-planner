"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckSquare, FileText, Paintbrush, Square, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { StatusBadge } from "@/components/content/status-badge";
import { humanFormat } from "@/lib/content/status";
import { DesignQueueBulkToolbar } from "./bulk-toolbar";
import { cn } from "@/lib/utils";

/**
 * Client-side design-queue list (FEAT-14, GAP-FULL-REVIEW-2026-08-25).
 *
 * Owns the per-item selection state. Renders the bulk-action
 * toolbar at the top when `canBulkArchive` is true, a card grid
 * with per-row checkboxes, and the empty state. The server page
 * has already filtered to the unassigned set and stamped the
 * href onto each item.
 */
export interface DesignQueueListItem {
  id: string;
  title: string;
  status: string;
  plannedPublishAtIso: string;
  href: string;
  /**
   * Designer-facing context. The master prompt §13 + the
   * /ui-ux-pro-max P3.2 pass says the queue must answer
   * "what creative work can / should a designer pick up?"
   * — that's a different question than "which items are
   * unassigned?", and the row needs the fields that answer
   * it. The server page is the source of these; the client
   * list is a thin renderer.
   */
  format: string;
  briefExcerpt: string | null;
  ownerDisplayName: string | null;
  /** ISO timestamp of the row's `updatedAt` for the
   * "last touched" tooltip on the card. */
  updatedAtIso: string;
  /** True when `brief` is empty or whitespace-only. Used
   * to surface the "brief not ready" indicator so a
   * designer can see which items are unclaimable
   * until the planner tightens the brief. */
  briefIsEmpty: boolean;
}

export function DesignQueueList({
  workspaceId,
  items,
  canBulkArchive,
}: {
  workspaceId: string;
  items: DesignQueueListItem[];
  canBulkArchive: boolean;
}) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const router = useRouter();

  const itemIds = React.useMemo(() => items.map((i) => i.id), [items]);
  const allChecked = itemIds.length > 0 && itemIds.every((id) => selected.has(id));
  const someChecked = !allChecked && itemIds.some((id) => selected.has(id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function onArchived() {
    setSelected(new Set());
    router.refresh();
  }

  if (items.length === 0) {
    return (
      <Card variant="dashed" padding="lg">
        <EmptyState
          icon={<Paintbrush className="h-8 w-8" />}
          title="No unassigned work"
          description="Approved ideas with no designer will appear here."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {canBulkArchive ? (
        <DesignQueueBulkToolbar
          workspaceId={workspaceId}
          itemIds={itemIds}
          selected={selected}
          onChange={setSelected}
          onArchived={onArchived}
        />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="design-queue-grid">
        {items.map((item) => {
          const isSelected = selected.has(item.id);
          return (
            <div
              key={item.id}
              className="border-border bg-surface hover:border-primary relative rounded-[var(--radius-card)] border p-4 transition-colors"
              data-testid="design-queue-row"
              data-selected={isSelected ? "true" : "false"}
            >
              {canBulkArchive ? (
                <input
                  type="checkbox"
                  className="absolute start-3 top-3 h-4 w-4 cursor-pointer accent-[var(--color-primary,#4f46e5)]"
                  aria-label={`Select ${item.title}`}
                  data-testid="design-queue-row-checkbox"
                  checked={isSelected}
                  onChange={() => toggleOne(item.id)}
                />
              ) : null}
              <div className={canBulkArchive ? "ps-7" : ""}>
                <Link
                  href={item.href}
                  className="focus-visible:ring-focus-ring block rounded focus:outline-none focus-visible:ring-2"
                >
                  <p className="text-body text-fg-primary font-semibold">{item.title}</p>
                  <p
                    className="text-label text-fg-muted mt-1 font-semibold tracking-wide uppercase"
                    data-testid="design-queue-row-format"
                  >
                    {humanFormat(item.format)}
                  </p>
                  <p
                    className="text-label text-fg-muted my-3"
                    data-testid="design-queue-row-required-by"
                  >
                    Required by {new Date(item.plannedPublishAtIso).toLocaleDateString()}
                  </p>
                  <p
                    className="text-body text-fg-secondary line-clamp-2"
                    data-testid="design-queue-row-brief"
                  >
                    {item.briefIsEmpty ? (
                      <span className="text-fg-muted italic">
                        Brief not ready — open the item to add a Hook / Main message / CTA.
                      </span>
                    ) : (
                      item.briefExcerpt
                    )}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {item.ownerDisplayName ? (
                      <span
                        className="text-label text-fg-muted inline-flex items-center gap-1"
                        data-testid="design-queue-row-owner"
                        title={`Owner: ${item.ownerDisplayName}`}
                      >
                        <User className="h-3 w-3" aria-hidden="true" />
                        <span className="font-semibold">Owner</span>
                        <span className="text-fg-primary font-medium">{item.ownerDisplayName}</span>
                      </span>
                    ) : (
                      <span
                        className="text-label text-fg-muted inline-flex items-center gap-1"
                        data-testid="design-queue-row-owner"
                        data-empty="true"
                      >
                        <User className="h-3 w-3" aria-hidden="true" />
                        <span className="font-semibold">Owner</span>
                        <span className="italic">Unassigned</span>
                      </span>
                    )}
                    {item.briefIsEmpty ? (
                      <span
                        className={cn(
                          "text-label inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold",
                          "bg-warning-subtle text-warning",
                        )}
                        data-testid="design-queue-row-brief-status"
                        data-brief-ready="false"
                      >
                        <FileText className="h-3 w-3" aria-hidden="true" />
                        Brief needed
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "text-label inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold",
                          "bg-success-subtle text-success",
                        )}
                        data-testid="design-queue-row-brief-status"
                        data-brief-ready="true"
                      >
                        <FileText className="h-3 w-3" aria-hidden="true" />
                        Brief ready
                      </span>
                    )}
                    <StatusBadge status={item.status} />
                  </div>
                </Link>
              </div>
              {canBulkArchive ? (
                <span className="absolute end-3 top-3" aria-hidden="true">
                  {isSelected ? (
                    <CheckSquare className="text-fg-muted h-4 w-4" />
                  ) : (
                    <Square className="text-fg-muted h-4 w-4" />
                  )}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      {canBulkArchive ? (
        <div className="text-label text-fg-muted">
          {allChecked || someChecked
            ? `${selected.size} of ${items.length} selected`
            : `${items.length} item${items.length === 1 ? "" : "s"}`}
        </div>
      ) : null}
    </div>
  );
}
