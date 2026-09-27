import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  FileEdit,
  Upload,
  MessageCircle,
  Sparkles,
  Eye,
  ShieldX,
  Play,
  Trash2,
  Package,
  Calendar,
  PaintBucket,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActivityIconKind, ActivityRenderSpec } from "@/lib/activity/types";
import { ActivityDiff } from "./activity-diff";

/**
 * ActivityEntry — presentational row for a single `activity_event`.
 *
 * This component owns ZERO formatting decisions. It consumes an
 * `ActivityRenderSpec` produced by `formatActivityEvent` and
 * renders it. Both the workspace-wide feed and the per-item
 * timeline use this same row.
 *
 * The component is server-renderable (no `"use client"`, no
 * hooks) — the parent component decides whether to wrap it in a
 * client boundary.
 *
 * The timestamp is rendered through a `renderTime` callback so
 * each surface can use its own locale-aware formatter (the
 * workspace feed honours the workspace timezone, the per-item
 * timeline uses the user's browser locale). This keeps the
 * existing per-surface time rendering intact while letting us
 * drop the per-surface `humanizeKind` ladders.
 */

const ICON_BY_KIND: Record<ActivityIconKind, React.ComponentType<{ className?: string }>> = {
  status_transition: ArrowRight,
  field_edit: FileEdit,
  schedule: Calendar,
  delivery: Upload,
  comment: MessageCircle,
  ai: Sparkles,
  publication: Eye,
  blocked: ShieldX,
  claimed: Play,
  system: Package,
  delete: Trash2,
  archive: AlertTriangle,
  create: PaintBucket,
  update: FileEdit,
  brand: PaintBucket,
};

export interface ActivityEntryProps {
  spec: ActivityRenderSpec;
  /** When true, render the row inside an existing `<ol>` —
   *  drop the outer padding. Used by both the workspace feed
   *  and the per-item timeline. */
  bare?: boolean;
  /**
   * Render the timestamp. The parent supplies its own
   * locale-aware formatter; we expose the ISO via
   * `spec.occurredAtIso`. When omitted, the raw ISO is shown.
   */
  renderTime?: (iso: string) => React.ReactNode;
}

export function ActivityEntry({ spec, bare = false, renderTime }: ActivityEntryProps) {
  const Icon = ICON_BY_KIND[spec.iconKind] ?? Package;
  const containerClass = bare
    ? "flex items-start gap-3"
    : "flex items-start gap-3 border-border border-b px-4 py-3 last:border-b-0 hover:bg-surface-subtle transition-colors";
  const timeNode = renderTime ? (
    renderTime(spec.occurredAtIso)
  ) : (
    <time dateTime={spec.occurredAtIso} data-testid="activity-entry-time">
      {spec.occurredAtIso}
    </time>
  );

  // The `<li>` carries the canonical `activity-entry` testid plus
  // the data-attrs. The legacy `activity-event` testid is preserved
  // on an inner wrapper so the existing per-item timeline tests
  // keep finding their rows after the migration.
  const liProps = {
    className: containerClass,
    "data-event-kind": spec.kind,
    "data-actor-id": spec.actor.id ?? "",
    "data-target-id": spec.target?.label ?? "",
  } as React.LiHTMLAttributes<HTMLLIElement>;

  return (
    <li {...liProps} data-testid="activity-entry">
      <div
        data-testid="activity-event"
        data-event-kind={spec.kind}
        data-actor-id={spec.actor.id ?? ""}
        data-target-id={spec.target?.label ?? ""}
        className="contents"
      >
        <span
          className={cn(
            "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
            spec.toneClass,
          )}
          aria-hidden="true"
          data-testid="activity-entry-icon"
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body text-fg-primary" data-testid="activity-entry-text">
            <bdi className="font-semibold" dir="auto">
              {spec.actor.name}
            </bdi>{" "}
            <bdi className="text-fg-secondary" dir="auto">
              {spec.verb}
            </bdi>{" "}
            {spec.target ? (
              spec.target.href ? (
                <Link
                  href={spec.target.href}
                  className="text-primary focus-visible:ring-focus-ring rounded-[var(--radius-control)] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                  data-testid="activity-entry-target"
                >
                  <bdi dir="auto">{spec.target.label}</bdi>
                </Link>
              ) : (
                <span className="text-fg-secondary" data-testid="activity-entry-target">
                  <bdi dir="auto">{spec.target.label}</bdi>
                </span>
              )
            ) : null}
            {spec.metadataLabel ? (
              <span className="text-fg-muted ms-1" data-testid="activity-entry-metadata">
                · <bdi dir="auto">{spec.metadataLabel}</bdi>
              </span>
            ) : null}
          </p>
          {spec.diff ? <ActivityDiff diff={spec.diff} /> : null}
          <p className="text-label text-fg-muted mt-1" data-testid="activity-entry-time-row">
            {timeNode}
          </p>
        </div>
      </div>
    </li>
  );
}
