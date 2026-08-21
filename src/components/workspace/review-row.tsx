import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { humanFormat } from "@/lib/content/status";

/**
 * Minimal shape the review queue row needs. The page supplies the DB
 * row (or a pre-shaped object) and the row renders a single link
 * to the content item with title, format, dates, and a gate badge.
 */
export type ReviewRowItem = {
  id: string;
  contentId: string;
  title: string;
  format: string;
  /** Date the review was requested. */
  requestedAt: Date | string;
  /** Optional due date; renders "due …" when present. */
  dueAt: Date | string | null;
  /** Approval gate (e.g. "content", "creative_internal", "creative_client"). */
  gate: string;
};

export interface ReviewRowProps {
  item: ReviewRowItem;
  workspaceSlug: string;
  /** Captured once by the parent so the overdue check is pure. */
  nowMs: number;
  /** Optional override for the "overdue" badge variant. */
  overdueVariant?: "danger" | "warning";
}

/**
 * ReviewRow — one row in the reviews queue. Title + format + dates on
 * the left, gate badge on the right. The whole row is a link to the
 * content item.
 *
 * Extracted from `w/[slug]/reviews/page.tsx` so the same row shape
 * is available to the future client review surface and the design
 * queue's "stuck approvals" view.
 */
export function ReviewRow({
  item,
  workspaceSlug,
  nowMs,
  overdueVariant = "danger",
}: ReviewRowProps) {
  const dueMs = item.dueAt
    ? item.dueAt instanceof Date
      ? item.dueAt.getTime()
      : new Date(item.dueAt).getTime()
    : null;
  const isOverdue = dueMs !== null && dueMs < nowMs;
  const requested =
    item.requestedAt instanceof Date ? item.requestedAt : new Date(item.requestedAt);
  const due = item.dueAt ? (item.dueAt instanceof Date ? item.dueAt : new Date(item.dueAt)) : null;
  return (
    <li>
      <Link
        href={`/app/w/${workspaceSlug}/planning/${item.contentId}`}
        data-testid={`review-row-${item.id}`}
        className="hover:bg-surface-subtle focus-visible:bg-surface-subtle flex flex-wrap items-center gap-3 px-4 py-3 focus:outline-none sm:px-5"
      >
        <div className="min-w-0 flex-1">
          <p className="text-body text-fg-primary truncate font-semibold">{item.title}</p>
          <p className="text-label text-fg-muted mt-1">
            {humanFormat(item.format)} · Requested {requested.toLocaleDateString()}
            {due ? ` · due ${due.toLocaleDateString()}` : ""}
          </p>
        </div>
        <Badge variant={isOverdue ? overdueVariant : "info"}>{item.gate.replace(/_/g, " ")}</Badge>
      </Link>
    </li>
  );
}
