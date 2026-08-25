import Link from "next/link";
import { StatusBadge } from "@/components/content/status-badge";
import { humanFormat, type ContentStatus } from "@/lib/content/status";

/**
 * One column on the workflow board. `label` is the human header,
 * `statuses` is the set of content statuses that bucket into it.
 */
export type WorkflowBoardColumn = {
  label: string;
  statuses: readonly ContentStatus[];
};

/**
 * The minimal content-item shape the board needs. We accept the bare
 * fields rather than the full DB row so the page can pre-shape
 * Date→string for serialisation if it wants to.
 */
export type WorkflowBoardItem = {
  id: string;
  title: string;
  format: string;
  status: ContentStatus;
  plannedPublishAt: Date | string;
};

export interface WorkflowBoardProps {
  items: readonly WorkflowBoardItem[];
  columns: readonly WorkflowBoardColumn[];
  workspaceSlug: string;
}

/**
 * WorkflowBoard — 7-column kanban-style view of every content item,
 * grouped by production stage. Renders a `<Link>` card per item with
 * the title, format, planned publish date, and current status badge.
 *
 * Extracted from `board/page.tsx` so the same column grouping + card
 * shape is available to any future surface (client review board, design
 * queue, etc.) without duplicating the 50-line render block.
 */
export function WorkflowBoard({ items, columns, workspaceSlug }: WorkflowBoardProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
      {columns.map((column) => {
        const rows = items.filter((item) =>
          (column.statuses as readonly string[]).includes(item.status),
        );
        const testIdKey = column.label.toLowerCase().replace(/\s+/g, "-");
        return (
          <section
            key={column.label}
            className="border-border bg-surface-subtle min-w-0 rounded-[var(--radius-card)] border p-3"
            data-testid={`board-column-${testIdKey}`}
          >
            <header className="mb-3 flex items-center justify-between">
              <h2 className="text-label text-fg-primary font-semibold">{column.label}</h2>
              <span
                className="text-label text-fg-muted bg-surface border-border min-w-6 rounded-full border px-1.5 text-center font-semibold"
                data-testid={`board-column-count-${testIdKey}`}
              >
                {rows.length}
              </span>
            </header>
            <div className="space-y-2">
              {rows.length ? (
                rows.map((item) => (
                  <BoardCard key={item.id} item={item} workspaceSlug={workspaceSlug} />
                ))
              ) : (
                <p className="text-label text-fg-muted py-4 text-center">No items</p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function BoardCard({ item, workspaceSlug }: { item: WorkflowBoardItem; workspaceSlug: string }) {
  const publishDate =
    item.plannedPublishAt instanceof Date ? item.plannedPublishAt : new Date(item.plannedPublishAt);
  return (
    <Link
      href={`/app/w/${workspaceSlug}/planning/${item.id}`}
      data-testid={`board-card-${item.id}`}
      className="border-border bg-surface hover:border-primary focus-visible:ring-focus-ring block rounded-[var(--radius-control)] border p-3 transition-colors focus:outline-none focus-visible:ring-2"
    >
      <p className="text-body text-fg-primary line-clamp-2 font-semibold">{item.title}</p>
      <p className="text-label text-fg-muted my-2">
        {humanFormat(item.format)} · {publishDate.toLocaleDateString()}
      </p>
      <StatusBadge status={item.status} />
    </Link>
  );
}
