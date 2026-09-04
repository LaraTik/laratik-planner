import Link from "next/link";
import { CalendarDays, Palette, User } from "lucide-react";
import { StatusBadge } from "@/components/content/status-badge";
import { humanFormat, statusBadgeVariant, type ContentStatus } from "@/lib/content/status";
import { formatDate } from "@/lib/i18n/format-locale";
import type { LocaleCode } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

/**
 * One column on the workflow board. `label` is the human header,
 * `statuses` is the set of content statuses that bucket into it.
 */
export type WorkflowBoardColumn = {
  label: string;
  statuses: readonly ContentStatus[];
};

/**
 * A single row in the `memberDirectory` map the board page passes
 * in. The page already loads the workspace member list for the
 * owner filter dropdown; we reuse the same fetch to look up
 * owner + designer names on the cards. Keeping the directory
 * shape minimal means the page does ONE extra round-trip
 * (already runs) instead of N per-card joins.
 */
export type BoardMemberEntry = {
  id: string;
  name: string | null;
  displayName: string | null;
};

/**
 * The minimal content-item shape the board needs. We accept the bare
 * fields rather than the full DB row so the page can pre-shape
 * Date→string for serialisation if it wants to.
 *
 * `contentOwnerId` + `designerId` are optional so callers that
 * only have the title/format/status can still render the card —
 * the role rows collapse to "Unassigned" when the id is missing
 * (matches the planning list's PeopleCell contract).
 */
export type WorkflowBoardItem = {
  id: string;
  title: string;
  format: string;
  status: ContentStatus;
  plannedPublishAt: Date | string;
  contentOwnerId?: string | null;
  designerId?: string | null;
};

export interface WorkflowBoardProps {
  items: readonly WorkflowBoardItem[];
  columns: readonly WorkflowBoardColumn[];
  workspaceSlug: string;
  locale?: LocaleCode;
  workspaceTimezone?: string;
  t?: (key: string, params?: Record<string, string | number>) => string;
  /**
   * Map of user id → display name. Optional — when omitted,
   * the card renders the role label only ("Owner" / "Designer")
   * with the value area blank. The board page already fetches
   * this for the owner filter; the board just reuses it.
   */
  memberDirectory?: Readonly<Record<string, BoardMemberEntry>>;
}

/**
 * Resolve the display name for a user id from the member
 * directory. Returns null when the user is missing (which the
 * caller renders as "Unassigned" in italic, matching the
 * planning list's PeopleCell contract).
 */
function displayNameFor(
  directory: Readonly<Record<string, BoardMemberEntry>> | undefined,
  id: string | null | undefined,
): string | null {
  if (!id) return null;
  const entry = directory?.[id];
  if (!entry) return null;
  return entry.displayName ?? entry.name ?? null;
}

/**
 * WorkflowBoard — 7-column kanban-style view of every content item,
 * grouped by production stage. Renders a `<Link>` card per item with
 * the title, format, planned publish date, current status badge, and
 * a clearly grouped, role-labelled Owner + Designer assignment block.
 *
 * Extracted from `board/page.tsx` so the same column grouping + card
 * shape is available to any future surface (client review board, design
 * queue, etc.) without duplicating the 50-line render block.
 *
 * Owner + Designer visibility (master prompt §5, §11): the
 * designer is a first-class operational role. The card surfaces
 * both, role-labelled, so the board answers "who is working on
 * this?" without the planner having to open the detail page.
 */
export function WorkflowBoard({
  items,
  columns,
  workspaceSlug,
  locale,
  workspaceTimezone,
  t,
  memberDirectory,
}: WorkflowBoardProps) {
  const activeLocale = locale ?? "en";
  const activeTimezone = workspaceTimezone ?? "UTC";
  return (
    <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-7">
      {columns.map((column) => {
        const rows = items.filter((item) =>
          (column.statuses as readonly string[]).includes(item.status),
        );
        const testIdKey = column.label.toLowerCase().replace(/\s+/g, "-");
        return (
          <section
            key={column.label}
            className="border-border bg-surface-subtle min-w-0 overflow-hidden rounded-[var(--radius-card)] border p-3"
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
                  <BoardCard
                    key={item.id}
                    item={item}
                    workspaceSlug={workspaceSlug}
                    {...(memberDirectory ? { memberDirectory } : {})}
                    locale={activeLocale}
                    workspaceTimezone={activeTimezone}
                    {...(t ? { t } : {})}
                  />
                ))
              ) : (
                <p className="text-label text-fg-muted py-4 text-center">
                  {t ? t("board.noItems") : "No items"}
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function PersonRow({
  Icon,
  roleLabel,
  name,
  roleAccent,
  testId,
  t,
}: {
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  roleLabel: string;
  name: string | null;
  roleAccent: "primary" | "warning";
  testId: string;
  t?: (key: string, params?: Record<string, string | number>) => string;
}) {
  const tone =
    roleAccent === "primary" ? "bg-primary-subtle text-primary" : "bg-warning-subtle text-warning";
  // Keep the role label and name in a vertical content stack. The board
  // can be seven columns wide at desktop, so a horizontal label/name split
  // leaves too little room for Arabic and long display names.
  return (
    <span
      className="border-border/80 bg-surface-subtle/60 text-label inline-flex max-w-full min-w-0 items-center gap-2 overflow-hidden rounded-[var(--radius-control)] border px-2 py-1.5"
      data-testid={testId}
      data-role={roleLabel.toLowerCase()}
      data-empty={name ? null : "true"}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
          name ? tone : "bg-surface-subtle text-fg-muted",
        )}
      >
        {name ? <Icon className="h-3 w-3" aria-hidden={true} /> : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-fg-muted truncate text-[10px] leading-3 font-semibold tracking-wide uppercase">
          {roleLabel}
        </span>
        {name ? (
          <bdi
            dir="auto"
            className="text-fg-primary block min-w-0 truncate font-medium"
            title={name}
          >
            {name}
          </bdi>
        ) : (
          <span className="text-fg-muted block min-w-0 truncate font-medium italic">
            {t ? t("common.ownerUnassigned") : "Unassigned"}
          </span>
        )}
      </span>
    </span>
  );
}

const STATUS_BORDER_CLASSES: Record<string, string> = {
  default: "border-s-border",
  primary: "border-s-primary",
  success: "border-s-success",
  warning: "border-s-warning",
  danger: "border-s-danger",
  info: "border-s-info",
  outline: "border-s-border",
};

function BoardCard({
  item,
  workspaceSlug,
  memberDirectory,
  locale,
  workspaceTimezone,
  t,
}: {
  item: WorkflowBoardItem;
  workspaceSlug: string;
  memberDirectory?: Readonly<Record<string, BoardMemberEntry>>;
  locale: LocaleCode;
  workspaceTimezone: string;
  t?: (key: string, params?: Record<string, string | number>) => string;
}) {
  const publishDate =
    item.plannedPublishAt instanceof Date ? item.plannedPublishAt : new Date(item.plannedPublishAt);
  const ownerName = displayNameFor(memberDirectory, item.contentOwnerId);
  const designerName = displayNameFor(memberDirectory, item.designerId);
  const statusBorder =
    STATUS_BORDER_CLASSES[statusBadgeVariant(item.status)] ?? STATUS_BORDER_CLASSES.default;
  return (
    <Link
      href={`/app/w/${workspaceSlug}/planning/${item.id}`}
      data-testid={`board-card-${item.id}`}
      className={cn(
        "group border-border bg-surface hover:border-primary/60 hover:bg-primary-subtle/20 focus-visible:ring-focus-ring block min-w-0 overflow-hidden rounded-[var(--radius-control)] border border-s-4 p-3 transition-[border-color,background-color,box-shadow] duration-200 hover:shadow-sm focus:outline-none focus-visible:ring-2",
        statusBorder,
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="bg-surface-subtle text-fg-secondary border-border/80 min-w-0 truncate rounded-full border px-2 py-0.5 text-[10px] leading-4 font-semibold">
          <bdi dir="auto">
            {t ? t(`planningFilters.formatLabels.${item.format}`) : humanFormat(item.format)}
          </bdi>
        </span>
      </div>
      <p className="text-title-card text-fg-primary mt-2 line-clamp-2 min-w-0 font-semibold">
        <bdi dir="auto">{item.title}</bdi>
      </p>
      <div className="text-label text-fg-muted mt-2 flex min-w-0 items-center gap-1.5" dir="auto">
        <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <time dateTime={publishDate.toISOString()} className="truncate">
          {formatDate(publishDate, locale, { timeZone: workspaceTimezone })}
        </time>
      </div>
      <div
        className="border-border mt-3 flex min-w-0 flex-col gap-1.5 border-t pt-2.5"
        data-testid="board-card-people"
      >
        <PersonRow
          Icon={Palette}
          roleLabel={t ? t("common.peopleRoleDesigner") : "Designer"}
          name={designerName}
          roleAccent="warning"
          testId="board-card-designer"
          {...(t ? { t } : {})}
        />
        <PersonRow
          Icon={User}
          roleLabel={t ? t("common.peopleRoleOwner") : "Owner"}
          name={ownerName}
          roleAccent="primary"
          testId="board-card-owner"
          {...(t ? { t } : {})}
        />
      </div>
      {!designerName ? (
        <p
          className="border-primary/20 bg-primary-subtle/60 text-label text-primary mt-2 flex items-start gap-1.5 rounded-[var(--radius-control)] border px-2 py-1.5 font-semibold"
          data-testid="board-card-designer-action"
        >
          <Palette className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t ? t("common.openItemToAssignDesigner") : "Open item to assign a designer"}
        </p>
      ) : null}
      <div
        className="border-border mt-3 flex min-w-0 items-center border-t pt-2.5"
        data-testid="board-card-status"
      >
        <StatusBadge status={item.status} {...(t ? { t } : {})} />
      </div>
    </Link>
  );
}
