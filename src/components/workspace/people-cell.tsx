import * as React from "react";
import { Palette, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EnrichedOwner } from "@/lib/content/enriched-list";

/**
 * PeopleCell — compact "people involved" cell that surfaces Owner
 * and Designer as two distinct role-labelled rows.
 *
 * Why two rows, not two pills:
 *  - Owner and Designer are different responsibilities in this
 *    workflow. The prompt + AGENTS.md §C require that they
 *    remain visually distinct — collapsing them into a single
 *    "assignee" loses the operational signal the planner needs.
 *  - Stacking vertically keeps the row's horizontal footprint
 *    unchanged (the same column width as the previous single
 *    Owner badge) so the row doesn't grow wider on tablet.
 *  - The role label is hidden on mobile (where the row already
 *    compresses to title + status + owner) and visible from
 *    `lg` up where the desktop layout has room.
 *
 * The cell renders a single owner + a single designer. Items
 * that gain a third role (e.g. reviewer) are surfaced on the
 * detail page, not here — the list stays decision-making only
 * (AGENTS.md §B).
 */
export interface PeopleCellProps {
  owner: EnrichedOwner | null;
  designer: EnrichedOwner | null;
  className?: string;
  /**
   * Optional translator. When provided, the role labels
   * (Owner / Designer) and the unassigned pill render from
   * `common.peopleRole{Owner,Designer}` + `common.ownerUnassigned`;
   * when omitted, the stored English copy is used.
   */
  t?: (key: string) => string;
}

function initials(displayName: string): string {
  if (!displayName) return "?";
  const parts = displayName.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function PersonRow({
  icon: Icon,
  roleLabel,
  person,
  testId,
  emptyLabel,
  roleAccent,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  roleLabel: string;
  person: EnrichedOwner | null;
  testId: string;
  emptyLabel: string;
  roleAccent: "primary" | "warning";
}) {
  const tone =
    roleAccent === "primary" ? "bg-primary-subtle text-primary" : "bg-warning-subtle text-warning";
  return (
    <span
      className="text-label inline-flex max-w-full min-w-0 items-center gap-1.5 overflow-hidden"
      data-testid={testId}
      data-role={roleLabel.toLowerCase()}
      data-person-id={person?.id ?? null}
      data-empty={person ? null : "true"}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
          person ? tone : "bg-surface-subtle text-fg-muted",
        )}
      >
        {person ? <Icon className="h-3 w-3" aria-hidden={true} /> : null}
      </span>
      <span className="text-fg-muted hidden font-semibold tracking-wide uppercase lg:inline">
        {roleLabel}
      </span>
      {person ? (
        <bdi dir="auto" className="text-fg-primary min-w-0 truncate font-medium">
          {person.displayName}
        </bdi>
      ) : (
        <span className="text-fg-muted min-w-0 truncate font-medium italic">{emptyLabel}</span>
      )}
    </span>
  );
}

export function PeopleCell({ owner, designer, className, t }: PeopleCellProps) {
  const tr = (key: string, fallback: string) => (t ? t(key) : fallback);
  return (
    <div
      className={cn("flex max-w-full min-w-0 flex-col gap-0.5", className)}
      data-testid="people-cell"
    >
      <PersonRow
        icon={User}
        roleLabel={tr("common.peopleRoleOwner", "Owner")}
        person={owner}
        testId="people-cell-owner"
        emptyLabel={tr("common.ownerUnassigned", "Unassigned")}
        roleAccent="primary"
      />
      <PersonRow
        icon={Palette}
        roleLabel={tr("common.peopleRoleDesigner", "Designer")}
        person={designer}
        testId="people-cell-designer"
        emptyLabel={tr("common.ownerUnassigned", "Unassigned")}
        roleAccent="warning"
      />
    </div>
  );
}

/**
 * Stand-alone helper that the row + the empty state can share.
 * Renders a single person's avatar tile; used for the test snapshot
 * and for any future role chip (e.g. reviewer).
 */
export function AvatarTile({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="border-border bg-surface-container text-fg-primary inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold"
    >
      {initials(name)}
    </span>
  );
}
