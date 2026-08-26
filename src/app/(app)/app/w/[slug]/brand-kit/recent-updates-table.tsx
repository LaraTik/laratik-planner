import * as React from "react";
import type { BrandRecentUpdate } from "@/lib/brand/service";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import { SectionEmptyState } from "@/components/workspace/section-empty-state";
import { History } from "lucide-react";
import { UserAvatar } from "./user-avatar";

/**
 * RecentUpdatesTable — the row-6 "Recent Updates" table.
 *
 * Round 4 replaces the previous hardcoded "M" avatar with the real
 * actor's display name + image (via `listRecentBrandUpdates`'s new
 * `actor` join). The row layout, columns, and empty state are
 * otherwise unchanged.
 *
 * Round 5 (rebuild, 2026-08-26) — wrap the relative timestamp in a
 * `<time dateTime={ISO} title={absoluteDate}>` so:
 *   1. Screen readers announce the full ISO date.
 *   2. Hovering reveals the absolute date (Oct 12, 2024, 14:32) which
 *      is more useful than the relative string for older rows.
 *   3. Copy-paste yields a parseable date.
 *
 * Accessibility:
 *   - The `<table>` uses semantic `<thead>` / `<tbody>` markup so a
 *     screen reader can announce column headers when reading each
 *     row.
 *   - The user cell wraps the avatar in `aria-label={displayName}`
 *     so the user is announced even when the avatar is a coloured
 *     initials chip.
 *   - The relative-date cell uses `formatRelativeDate` for
 *     consistency with the rest of the app (per master prompt §18
 *     "consistent date format").
 */
export interface RecentUpdatesTableProps {
  rows: BrandRecentUpdate[];
}

function absoluteDateLabel(d: Date): string {
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RecentUpdatesTable({ rows }: RecentUpdatesTableProps) {
  if (rows.length === 0) {
    return (
      <SectionEmptyState
        icon={History}
        title="No recent updates yet"
        description="As the team adds logos, colors, fonts, voice rules, and publishing guidelines, the latest changes will appear here."
        testId="brand-kit-empty-recent"
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="text-body w-full text-left">
        <thead>
          <tr className="text-label text-fg-muted">
            <th className="pr-3 pb-2 font-semibold" scope="col">
              When
            </th>
            <th className="pr-3 pb-2 font-semibold" scope="col">
              What
            </th>
            <th className="pb-2 font-semibold" scope="col">
              By
            </th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {rows.map((row, index) => {
            const key = `${row.kind}-${row.updatedAt.toString()}-${index}`;
            return (
              <tr key={key} data-testid="brand-recent-row">
                <td className="text-fg-secondary py-2 pr-3">
                  <time
                    dateTime={row.updatedAt.toISOString()}
                    title={absoluteDateLabel(row.updatedAt)}
                  >
                    {formatRelativeDate(row.updatedAt)}
                  </time>
                </td>
                <td className="text-fg-primary py-2 pr-3">{row.description}</td>
                <td className="py-2">
                  {row.actor ? (
                    <span className="inline-flex items-center gap-2">
                      <UserAvatar
                        displayName={row.actor.displayName}
                        image={row.actor.image}
                        size="xs"
                        data-testid={`brand-recent-actor-${index}`}
                      />
                      <span className="text-label text-fg-secondary">{row.actor.displayName}</span>
                    </span>
                  ) : (
                    <span className="text-label text-fg-muted">Unknown</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
