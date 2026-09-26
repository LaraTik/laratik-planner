import Link from "next/link";
import { CheckSquare2, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  humanFormat,
  humanStatus,
  statusBadgeVariant,
  type ContentFormat,
  type ContentStatus,
} from "@/lib/content/status";
import { taskBadgeVariant, priorityBadgeVariant } from "@/lib/tasks/status-badge";
import type { TaskPriority } from "@/lib/tasks/service";
import type { TaskStatus } from "@/lib/tasks/workflow";
import { cn } from "@/lib/utils";

/**
 * CalendarEventCard — the day-cell chip on the editorial calendar
 * (`/app/w/[slug]/calendar`) AND the agency-overview day cell
 * (`/app/calendar`).
 *
 * Extracted so a third consumer (board / client calendar / future
 * agenda view) can render the same status + format chip without
 * re-implementing the badge variant + left-border accent. The
 * `variant="default"` rendering is the agency-overview card; the
 * `variant="compact"` rendering is the per-workspace day cell.
 *
 * Status is represented by **text + colour** (per master prompt §3
 * accessibility rule: status never uses colour alone). The format
 * (plan) / priority (task) shows as a humanized label.
 *
 * History: round-2026-09-26 unified two near-identical inline cards
 * into one component. The agency-overview used to render status as
 * plain text while the workspace calendar rendered it with a colour
 * cue — the gap made it impossible for admins to spot blocked /
 * in-review / done items at a glance on the global view.
 */
export type CalendarEventCardKind = "plan" | "task";

export type CalendarEventCardProps = {
  id: string;
  href: string;
  title: string;
  /**
   * Event kind. `"plan"` defaults the status / format mapping to
   * `statusBadgeVariant` / `humanFormat`; `"task"` switches to the
   * task-status / priority variants. Defaults to `"plan"` for
   * back-compat with the workspace calendar.
   */
  kind?: CalendarEventCardKind;
  /**
   * `"compact"` — tight day-cell chip (workspace calendar).
   * `"default"` — fuller card with workspace + assignee metadata
   * (agency-overview calendar). Defaults to `"compact"`.
   */
  variant?: "compact" | "default";
  status: string;
  /** Optional locale-resolved status label. */
  statusLabel?: string | undefined;
  /** Content format (plans only). Ignored for tasks. */
  format?: ContentFormat | string | undefined;
  /** Optional locale-resolved format label. */
  formatLabel?: string | undefined;
  /** Task priority (tasks only). Ignored for plans. */
  priority?: TaskPriority | string | undefined;
  /** Optional locale-resolved priority label. */
  priorityLabel?: string | undefined;
  /** Workspace name (agency-overview only). */
  workspaceName?: string | null | undefined;
  /** Assignee display name (agency-overview, tasks only). */
  assigneeName?: string | null | undefined;
  /** Locale-resolved "no workspace" label (agency-overview only). */
  noWorkspaceLabel?: string | undefined;
  /** Locale-resolved kind label (agency-overview only). */
  kindLabel?: string | undefined;
};

const LEFT_BORDER_BY_VARIANT: Record<string, string> = {
  success: "border-s-success",
  warning: "border-s-warning",
  danger: "border-s-danger",
  info: "border-s-info",
  primary: "border-s-primary",
  default: "border-s-border",
};

/**
 * Resolve the badge variant for a given kind + status. Centralised
 * so the badge + the left-border accent always agree (no risk of a
 * future status getting the colour in one place but not the other).
 */
function badgeVariantFor(kind: CalendarEventCardKind, status: string) {
  return kind === "task" ? taskBadgeVariant(status) : statusBadgeVariant(status);
}

function defaultStatusLabel(kind: CalendarEventCardKind, status: string): string {
  return kind === "task" ? humanTaskStatus(status) : humanStatus(status);
}

function humanTaskStatus(s: string): string {
  if (!s) return s;
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function CalendarEventCard({
  id,
  href,
  title,
  kind = "plan",
  variant = "compact",
  status,
  statusLabel,
  format,
  formatLabel,
  priority,
  priorityLabel,
  workspaceName,
  assigneeName,
  noWorkspaceLabel,
  kindLabel,
}: CalendarEventCardProps) {
  const badgeVariant = badgeVariantFor(kind, status);
  const leftBorder = LEFT_BORDER_BY_VARIANT[badgeVariant] ?? LEFT_BORDER_BY_VARIANT.default;
  const resolvedStatusLabel = statusLabel ?? defaultStatusLabel(kind, status);
  const secondaryLabel =
    kind === "task"
      ? (priorityLabel ?? (priority ? humanTaskPriority(priority) : null))
      : (formatLabel ?? (format ? humanFormat(format) : null));

  if (variant === "default") {
    return (
      <Link
        href={href}
        data-testid={`calendar-event-${id}`}
        className={cn(
          "hover:border-primary block rounded border p-2 transition-colors",
          leftBorder,
          "border-s-4",
        )}
      >
        <span className="text-label text-fg-muted inline-flex items-center gap-1 font-semibold">
          {kind === "task" ? (
            <CheckSquare2 className="h-3 w-3" aria-hidden="true" />
          ) : (
            <FileText className="h-3 w-3" aria-hidden="true" />
          )}
          {kindLabel ?? (kind === "task" ? "Task" : "Plan")}
        </span>
        <span className="text-label text-fg-primary mt-1 block font-semibold wrap-break-word" dir="auto">
          {title}
        </span>
        <span className="text-label text-fg-muted mt-1 block truncate">
          {workspaceName ?? noWorkspaceLabel ?? "—"}
        </span>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge variant={badgeVariant} className="text-[10px]">
            {resolvedStatusLabel}
          </Badge>
          {secondaryLabel ? (
            <span
              className={cn(
                "text-label truncate",
                kind === "task" && priority
                  ? // Subtle secondary colour cue so the priority is
                    // legible at a glance even without reading the
                    // text label (admin quick-overview requirement).
                    priorityBadgeText(priority)
                  : "text-fg-muted",
              )}
            >
              {secondaryLabel}
            </span>
          ) : null}
        </div>
        {kind === "task" && assigneeName ? (
          <span className="text-label text-fg-muted mt-1 block truncate">{assigneeName}</span>
        ) : null}
      </Link>
    );
  }

  // variant === "compact" — original day-cell rendering.
  return (
    <Link
      href={href}
      data-testid={`calendar-event-${id}`}
      className={cn(
        "hover:border-primary block rounded border p-2 transition-colors",
        // Per status: a left border in the badge colour so the day cell
        // shows the status at a glance without competing with the
        // badge inside.
        leftBorder,
        "border-s-4",
      )}
    >
      <p className="text-label text-fg-primary truncate font-semibold" dir="auto">
        {title}
      </p>
      <div className="mt-1 flex items-center gap-1.5">
        <Badge variant={badgeVariant} className="text-[10px]">
          {resolvedStatusLabel}
        </Badge>
        {secondaryLabel ? (
          <span className="text-label text-fg-muted truncate">{secondaryLabel}</span>
        ) : null}
      </div>
    </Link>
  );
}

/**
 * Map a priority to a text colour token so the secondary line on
 * the agency-overview task card carries the same cue as the
 * priority badge (admin quick-overview requirement). We use text
 * colour (not the swatch) to avoid competing with the status badge
 * above it; the status colour remains the dominant visual cue.
 */
function priorityBadgeText(priority: string): string {
  const variant = priorityBadgeVariant(priority);
  if (variant === "danger") return "text-danger font-semibold";
  if (variant === "warning") return "text-warning font-semibold";
  if (variant === "info") return "text-info";
  return "text-fg-muted";
}

function humanTaskPriority(p: string): string {
  if (!p) return p;
  return p.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Silence unused-type-only-import lint: the type aliases are used in
// the props shape for documentation; importing them via `import type`
// also keeps the bundle tree-shake-friendly.
export type { ContentStatus, ContentFormat, TaskStatus, TaskPriority };
