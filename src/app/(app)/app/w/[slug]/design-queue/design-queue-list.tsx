"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckSquare, Square, Paintbrush } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { StatusBadge } from "@/components/content/status-badge";
import { DesignQueueBulkToolbar } from "./bulk-toolbar";

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

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(itemIds));
  }
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
      <div
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
        data-testid="design-queue-grid"
      >
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
                  className="absolute left-3 top-3 h-4 w-4 cursor-pointer accent-[var(--color-primary,#4f46e5)]"
                  aria-label={`Select ${item.title}`}
                  data-testid="design-queue-row-checkbox"
                  checked={isSelected}
                  onChange={() => toggleOne(item.id)}
                />
              ) : null}
              <div className={canBulkArchive ? "pl-7" : ""}>
                <Link
                  href={item.href}
                  className="focus-visible:ring-focus-ring block rounded focus:outline-none focus-visible:ring-2"
                >
                  <p className="text-body text-fg-primary font-semibold">{item.title}</p>
                  <p className="text-label text-fg-muted my-3">
                    Publish {new Date(item.plannedPublishAtIso).toLocaleDateString()}
                  </p>
                  <StatusBadge status={item.status} />
                </Link>
              </div>
              {canBulkArchive ? (
                <span className="absolute right-3 top-3" aria-hidden="true">
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
