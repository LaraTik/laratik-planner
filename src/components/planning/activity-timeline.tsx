"use client";

import * as React from "react";
import { ActivityTimeline as SharedActivityTimeline } from "@/components/activity";
import type { ActivityContext, ActivityRenderSpec } from "@/lib/activity/types";
import { formatActivityEvent } from "@/lib/activity/format";
import { useLocaleCode } from "@/components/i18n/locale-provider";
import { DateFormat, formatDate } from "@/lib/i18n/format-locale";

/**
 * Per-item ActivityTimeline — thin client wrapper around the
 * shared `<ActivityTimeline />` server component.
 *
 * The shared renderer does the actual formatting (verb
 * templates, diff chips, channel labels, status names). This
 * client wrapper exists only because the timeline sits inside
 * a `"use client"` boundary (the planning detail shell
 * already has client-only state for the discussion / messages
 * panels). We do NOT call the server-only resolver here —
 * the parent (a server component) passes a pre-built
 * `ActivityContext` as a prop.
 *
 * Migration note (2026-09-27): the previous implementation
 * carried its own `ICON_BY_KIND`, `TONE_BY_KIND`, and
 * `humanizeKind`. Both surfaces (this + the workspace feed)
 * now read from the shared formatter, so a new `kind` is one
 * verb template + (optionally) one resolver entry.
 */

export interface ActivityEventView {
  id: string;
  kind: string;
  summary: string;
  actorName: string;
  occurredAt: string;
  /** Optional target label (e.g. content item title). When
   *  omitted, the formatter renders "(deleted item)" as the
   *  target — useful when the caller doesn't know the title. */
  targetLabel?: string | null;
  metadata?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  beforeData?: Record<string, unknown> | null;
}

export interface ActivityTimelineProps {
  events: ActivityEventView[];
  /** Optional title shown above the list. */
  title?: string;
  /** Maximum events to render. Older events fall off the
   *  bottom — the parent decides the cut. */
  maxEvents?: number;
  /**
   * Bound translator from the parent. Resolves the section
   * title, the empty state, the "older events" truncation
   * note, and every `kind`-based humanised phrase through
   * the active message catalog.
   */
  t: (key: string, params?: Record<string, string | number>) => string;
  /**
   * Pre-built `ActivityContext` from a server-side call to
   * `buildActivityContext`. When omitted, the timeline builds
   * a minimal context from the event's pre-joined
   * `actorName` (works for the per-item shell, where the
   * actor is the only foreign key we render).
   */
  context?: ActivityContext | null;
}

export function ActivityTimeline({
  events,
  title,
  maxEvents = 25,
  t,
  context: providedContext,
}: ActivityTimelineProps) {
  const locale = useLocaleCode();
  // Build a minimal context from the per-event `actorName`
  // already pre-joined by `listActivityEvents`. This keeps the
  // per-item timeline self-sufficient when no upstream
  // context is provided (the common case for the planning
  // detail page). The shared formatter falls back to the
  // empty-value labels for IDs that the per-item context
  // doesn't know about; the workspace feed's full context
  // is the upgrade path for richer rows.
  const context = React.useMemo<ActivityContext>(() => {
    if (providedContext) return providedContext;
    const userById = new Map<string, { name: string; email: string | null }>();
    for (const e of events) {
      if (e.actorName) {
        // The per-item timeline already knows the actor's
        // display name; we seed it under a stable sentinel
        // (the event id) so the formatter can resolve it.
        userById.set(e.id, { name: e.actorName, email: null });
      }
    }
    // Seed the status + format labels from the canonical
    // humanizers. The per-item timeline doesn't pre-join
    // status names — it relies on the formatter to map
    // enum → label. Without this seed, status transitions
    // render as "from (empty) to (empty)".
    const statusLabels = new Map<string, string>();
    const STATUSES = [
      "draft",
      "content_review",
      "approved_for_design",
      "in_design",
      "creative_review",
      "ready_to_publish",
      "partially_published",
      "published",
      "changes_requested",
      "blocked",
      "cancelled",
    ];
    for (const v of STATUSES) {
      statusLabels.set(
        v,
        v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      );
    }
    return {
      workspaceId: "",
      statusLabels,
      formatLabels: new Map(),
      userById,
      channelByContentItemChannelId: new Map(),
      designerByContentItemId: new Map(),
      ownerByContentItemId: new Map(),
    };
  }, [providedContext, events]);

  const renderTime = React.useCallback(
    (iso: string) => formatDate(iso, locale, DateFormat.dateTime),
    [locale],
  );

  const formatDateForDiff = React.useCallback(
    (value: string | Date) => formatDate(value, locale, DateFormat.dateTime),
    [locale],
  );

  const specs: ActivityRenderSpec[] = events.map((e) => {
    const ctx = providedContext ?? {
      ...context,
      // Use the per-event actorName as the lookup key so the
      // formatter can resolve "system" / "Ada Lovelace"
      // without a separate server round-trip. The full
      // workspace context replaces this on the server side.
      userById: (() => {
        const next = new Map(context.userById);
        if (e.actorName) next.set(e.id, { name: e.actorName, email: null });
        return next;
      })(),
    };
    return formatActivityEvent(
      {
        id: e.id,
        kind: e.kind,
        summary: e.summary,
        // The formatter uses the context's userById map to
        // resolve actor names. For the per-item timeline we
        // look up by event id, not actor id, because the
        // server-side `actorId` is not in the projection.
        actorId: e.id,
        occurredAt: e.occurredAt,
        metadata: e.metadata ?? null,
        beforeData: e.beforeData ?? null,
        afterData: e.afterData ?? null,
        targetLabel: e.targetLabel ?? null,
        targetId: null,
      },
      ctx,
      t,
      {
        formatDate: formatDateForDiff,
        systemActorFallback: e.actorName,
      },
    );
  });

  return (
    <SharedActivityTimeline
      specs={specs}
      {...(title !== undefined ? { title } : {})}
      maxEvents={maxEvents}
      renderTime={renderTime}
      t={t}
    />
  );
}
