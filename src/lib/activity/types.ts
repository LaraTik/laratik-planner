/**
 * Activity log — shared types.
 *
 * The activity log is rendered identically across two surfaces:
 *   1. The workspace-wide feed at `/app/w/[slug]/activity`
 *   2. The per-content-item timeline on the planning detail page.
 *
 * Historically each surface carried its own `humanizeKind` /
 * icon table / tone table, which made the two diverge and
 * made every new `kind` a multi-file edit. This module is
 * the single source of truth.
 *
 * The pipeline is:
 *
 *     listActivity*()          → raw events (kind, summary, metadata,
 *                                 beforeData, afterData, …)
 *            ↓
 *     buildActivityContext()   → ID → name lookup maps
 *            ↓
 *     formatActivityEvent()    → `ActivityRenderSpec` (pure)
 *            ↓
 *     <ActivityEntry />        → presentational row
 *
 * The only file that touches `db` is `resolve.ts`. The only
 * file that renders is `components/activity/activity-entry.tsx`.
 * The formatter is the contract between them.
 */

import type { activityKindEnum } from "@/lib/db/schema/enums";

/** A single event row exactly as stored in `activity_event` plus the
 *  minimal projection the formatter needs. Anything else lives in the
 *  resolver output (`ActivityContext`). */
export interface RawActivityEvent {
  id: string;
  /** Activity kind. Mirrors `activity_kind` enum values plus the
   *  brand-kit dotted-namespace rows (`brand.<kind>`). */
  kind: string;
  /** Free-text fallback. The formatter prefers the structured
   *  `verbTemplate + context`; this is shown only when the verb
   *  template is missing for the kind. */
  summary: string;
  /** Actor who performed the action (UUID or null for system). */
  actorId: string | null;
  /** Event timestamp. */
  occurredAt: Date | string;
  /** Optional deep link the entry should expose (e.g. into the
   *  content-item detail page). */
  href?: string | null;
  /** Free-form key/value bag. Convention: never embed raw UUIDs
   *  in human copy here — store the ID and resolve in the formatter. */
  metadata?: unknown;
  /** State before the change. Typed `unknown` because the backing
   *  `activity_event.before_data` column is `jsonb` and accepts any
   *  JSON value.
   *
   *  INVARIANT: this MUST be a JSON object (or null/absent) — read
   *  it through `asRecord()` in `format.ts`, never with a bare `in`
   *  or spread.
   *
   *  Incident 2026-09-27: `recordMaterialityEvent` wrote bare
   *  scalars (an ISO date for `schedule`, `"(payload)"` for
   *  `platform_payload`) into this column behind an `as never`
   *  cast. The formatter's `"status" in before` then threw
   *  `TypeError: Cannot use 'in' operator`, and because
   *  `buildVerb` computes before/after labels for *every* event,
   *  one bad row 500'd the whole planning-detail route. 12 of 83
   *  production content items were affected. The writer and the
   *  reader are both fixed; the honest `unknown` type is what stops
   *  a third writer from repeating it. */
  beforeData?: unknown;
  /** State after the change. Same invariant as `beforeData`. */
  afterData?: unknown;
  /** Workspace-scoped label (e.g. content item title). The
   *  formatter renders this as the entry's target. */
  targetLabel?: string | null;
  /** Stable id of the entry's target (e.g. content_item.id) when
   *  it differs from `id`. Used for `data-target-id` and target
   *  link generation. */
  targetId?: string | null;
  /** When true, the formatter renders the entry without a diff
   *  block even if `beforeData`/`afterData` are present (e.g.
   *  bulk operations that don't carry per-item diffs). */
  noDiff?: boolean;
}

/** Activity kind vocabulary used by the formatter. Mirrors the
 *  `activityKindEnum` plus the brand-kit dotted-namespace rows. */
export type ActivityKind =
  | (typeof activityKindEnum.enumValues)[number]
  | `brand.${string}`
  | "approval"
  | "changes_requested";

/** Icon vocabulary shared between both surfaces. The mapping from
 *  `kind` → icon lives in `format.ts`. */
export type ActivityIconKind =
  | "status_transition"
  | "field_edit"
  | "delivery"
  | "comment"
  | "ai"
  | "publication"
  | "blocked"
  | "claimed"
  | "system"
  | "delete"
  | "archive"
  | "create"
  | "update"
  | "brand"
  | "schedule";

/** The fully-resolved spec consumed by `<ActivityEntry />`. Pure data. */
export interface ActivityRenderSpec {
  /** Stable id from the source row. */
  id: string;
  /** Activity kind (raw value, useful for filters + data attrs). */
  kind: string;
  /** Already-translated verb phrase. */
  verb: string;
  /** Actor chip. */
  actor: {
    id: string | null;
    name: string;
    toneSeed: string;
    href: string | null;
  };
  /** Optional target label (e.g. content item title) + href. */
  target: { label: string; href: string | null } | null;
  /** Optional metadata suffix (e.g. "Instagram · LaraTik Main"). */
  metadataLabel: string | null;
  /** Optional before/after diff for fields like brief / status. */
  diff: ActivityDiff | null;
  iconKind: ActivityIconKind;
  toneClass: string;
  /** ISO timestamp for `time.dateTime`. */
  occurredAtIso: string;
}

export interface ActivityDiff {
  /** Field name as understood by the i18n catalog (e.g. "brief", "status"). */
  field: string;
  /** Localised field label, e.g. "Brief" / "Status". */
  fieldLabel: string;
  /** Before value. */
  before: { label: string; href?: string | null };
  /** After value. */
  after: { label: string; href?: string | null };
  /** `chip` for short values (status, date, name), `text` for
   *  long values (brief, title, copy). */
  shape: "chip" | "text";
  /** When the diff has no actual change (before === after) the
   *  formatter still emits the spec so the field shows as
   *  "unchanged". */
  unchanged?: boolean;
}

/** Per-workspace lookup tables produced by `buildActivityContext`. */
export interface ActivityContext {
  workspaceId: string;
  /** status enum value → human label (already localised). */
  statusLabels: Map<string, string>;
  /** content format enum value → human label. */
  formatLabels: Map<string, string>;
  /** userId → { displayName, email }. */
  userById: Map<string, { name: string; email: string | null }>;
  /** contentItemChannelId → { label, platform }. The label is the
   *  formatted "Instagram · LaraTik Main" string. */
  channelByContentItemChannelId: Map<string, { label: string; platform: string }>;
  /** contentItemId → designer display name (most-recent active
   *  designer assignment). */
  designerByContentItemId: Map<string, { id: string; name: string } | null>;
  /** contentItemId → owner display name. */
  ownerByContentItemId: Map<string, { id: string; name: string } | null>;
}
