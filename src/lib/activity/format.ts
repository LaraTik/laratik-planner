/**
 * Activity formatter — pure (no `db`, no `import "server-only"`).
 *
 * Given a raw event + the per-workspace `ActivityContext` +
 * a translator `t`, produces an `ActivityRenderSpec` that the
 * shared `<ActivityEntry />` renders.
 *
 * Why this is a pure function:
 *
 *   1. Unit-testable in isolation, no `next/headers`, no `db`.
 *   2. Bilingual by construction — every string comes from `t()`.
 *   3. Diff-friendly — `brief_updated` / `title_updated` /
 *      `date_updated` / `content_copy_patched` produce a
 *      `text`-shaped diff; status transitions, designer /
 *      owner changes, reschedules, publications produce a
 *      `chip`-shaped diff.
 *   4. Extension recipe — to support a new `kind`, add one
 *      verb template under `activity.verbs.<kind>` and (only
 *      if the kind carries new ID-bearing fields) extend the
 *      resolver. Never edit `<ActivityEntry />` to support a
 *      new kind.
 *
 * The function is a single switch on `event.kind`. The
 * canonical kind vocabulary is `ActivityKind` in `types.ts`.
 * Adding a brand-kit dotted row (`brand.<x>`) is the only
 * "open" path; it routes through the `brand_update` verb
 * with the brand-kit row label as the target.
 */

import { humanStatus } from "@/lib/content/status";
import type {
  ActivityContext,
  ActivityDiff,
  ActivityIconKind,
  ActivityRenderSpec,
  RawActivityEvent,
} from "./types";
import { resolveActorName, resolveChannelLabel, resolveStatusLabel } from "./resolve";

/** Translator signature mirroring `next-intl`'s `t()`. */
export type Translator = (key: string, params?: Record<string, string | number>) => string;

/** Locale-aware date formatter used by the chip / date diff. */
export type DateFormatter = (value: string | Date) => string;

export interface FormatOptions {
  /** Locale-aware date formatter (e.g. `formatDate(...)`). */
  formatDate: DateFormatter;
  /** Optional fallback shown when the event has no actor
   *  (system events). Defaults to `t("activity.systemActor")`. */
  systemActorFallback?: string;
}

/**
 * Format a single raw event into an `ActivityRenderSpec`.
 *
 * The function is safe to call with any combination of
 * `beforeData` / `afterData` / `metadata` — every branch
 * falls back to a localised placeholder when an expected
 * field is missing. This keeps the formatter a single
 * source of truth and removes the per-surface fallback
 * ladders the old renderers carried.
 */
export function formatActivityEvent(
  event: RawActivityEvent,
  ctx: ActivityContext,
  t: Translator,
  opts: FormatOptions,
): ActivityRenderSpec {
  const iconKind = iconForKind(event.kind);
  const toneClass = toneForKind(event.kind);
  const systemName = opts.systemActorFallback ?? t("activity.systemActor");
  const actorName = resolveActorName(ctx, event.actorId, systemName);
  const actorEmail = (event.actorId ? ctx.userById.get(event.actorId)?.email : null) ?? null;
  const target = buildTarget(event, t);
  const verb = buildVerb(event, ctx, t, opts);
  const metadataLabel = buildMetadataLabel(event, ctx, t);
  const diff = event.noDiff ? null : buildDiff(event, ctx, t, opts);

  return {
    id: event.id,
    kind: event.kind,
    verb,
    actor: {
      id: event.actorId,
      name: actorName,
      toneSeed: actorName || actorEmail || "system",
      href: event.actorId ? `/app/users/${event.actorId}` : null,
    },
    target,
    metadataLabel,
    diff,
    iconKind,
    toneClass,
    occurredAtIso:
      typeof event.occurredAt === "string" ? event.occurredAt : event.occurredAt.toISOString(),
  };
}

// ─── Verb templates ────────────────────────────────────────────────

function buildVerb(
  event: RawActivityEvent,
  ctx: ActivityContext,
  t: Translator,
  opts: FormatOptions,
): string {
  const templateKey = templateForKind(event);
  const params: Record<string, string | number> = {};
  const targetLabel = event.targetLabel ?? t("activity.unknownTarget");
  params.target = targetLabel;
  params.before = beforeLabel(event, ctx, t, opts);
  params.after = afterLabel(event, ctx, t, opts);
  // The `metadata` placeholder is shared by `delivery` and
  // `publication` verbs ("delivered V1 for X", "marked X as
  // published on Instagram · LaraTik Main"). The formatter
  // resolves it via `buildMetadataLabel`, which already
  // produces a channel label or delivery version. When no
  // metadata applies, the placeholder collapses via the
  // surrounding text (e.g. "delivered for {target}" still
  // reads cleanly).
  params.metadata = buildMetadataLabel(event, ctx, t) ?? "";
  if (event.kind === "bulk_delete" || event.kind === "bulk_archive") {
    params.count = readCount(event) ?? 0;
  }
  const template = templateKey ? t(templateKey) : null;
  if (template && !template.startsWith("[")) {
    return interpolate(template, params);
  }
  // Last-resort fallback: render the (legacy) summary verbatim
  // so we never leak a raw enum. If `summary` is empty we emit
  // a clean dash.
  return event.summary || `${event.kind.replace(/[._]/g, " ")}`;
}

function templateForKind(event: RawActivityEvent): string | null {
  const kind = event.kind;
  // brand.<x> — treat the brand-kit rows as a single vocabulary.
  if (kind.startsWith("brand.")) return "activity.verbs.brand_update";

  // assignment kind carries three sub-flavours: designer, owner,
  // designer release. Detect via `beforeData` / `afterData`.
  if (kind === "assignment") {
    const merged = mergedFields(event);
    if ("contentOwnerId" in merged) {
      return "activity.verbs.assignment_owner";
    }
    // Release: the after designerId is null/undefined.
    const afterId = merged.designerId;
    if ("designerId" in (event.beforeData ?? {}) && (afterId === null || afterId === undefined)) {
      return "activity.verbs.assignment_designer_released";
    }
    return "activity.verbs.assignment_designer";
  }

  // publication kind has three meta subkinds.
  if (kind === "publication") {
    const subkind = readSubkind(mergedFields(event));
    if (subkind === "meta_linked") return "activity.verbs.publication_meta_linked";
    if (subkind === "meta_refreshed") return "activity.verbs.publication_meta_refreshed";
    if (subkind === "meta_reconciled") return "activity.verbs.publication_meta_reconciled";
    return "activity.verbs.publication";
  }

  return `activity.verbs.${kind}`;
}

function mergedFields(e: RawActivityEvent): Record<string, unknown> {
  return { ...(e.metadata ?? {}), ...(e.beforeData ?? {}), ...(e.afterData ?? {}) };
}

function readSubkind(bag: Record<string, unknown>): string | null {
  const v = bag.subkind;
  return typeof v === "string" ? v : null;
}

function readCount(event: RawActivityEvent): number | null {
  const bag = event.metadata;
  if (!bag) return null;
  const v = bag.count ?? bag.archivedCount ?? bag.deletedCount;
  return typeof v === "number" ? v : null;
}

// ─── Target label + link ──────────────────────────────────────────

function buildTarget(
  event: RawActivityEvent,
  t: Translator,
): { label: string; href: string | null } | null {
  const label = event.targetLabel ?? t("activity.unknownTarget");
  // The verb template needs a target, but the row's link
  // (the `<Link href={...}>`) only renders when we have a
  // real label + href. Always emit a target spec so the verb
  // interpolates the placeholder string.
  return {
    label,
    href: event.targetLabel ? (event.href ?? null) : null,
  };
}

// ─── Before / after labels (chip input) ───────────────────────────

function beforeLabel(
  event: RawActivityEvent,
  ctx: ActivityContext,
  t: Translator,
  opts: FormatOptions,
): string {
  const empty = t("activity.diff.empty_value");
  const before = event.beforeData ?? {};
  if ("status" in before) {
    return resolveStatusLabel(ctx, stringOrNull(before.status)) || empty;
  }
  if ("plannedPublishAt" in before) {
    return beforeDate(before.plannedPublishAt, opts, empty);
  }
  if ("designerId" in before) {
    return resolveUserNameFromId(ctx, before.designerId, empty);
  }
  if ("contentOwnerId" in before) {
    return resolveUserNameFromId(ctx, before.contentOwnerId, empty);
  }
  if ("title" in before) {
    return stringOrNull(before.title) ?? empty;
  }
  if ("brief" in before) {
    return stringOrNull(before.brief) ?? empty;
  }
  if ("format" in before) {
    return stringOrNull(before.format) ?? empty;
  }
  return empty;
}

function afterLabel(
  event: RawActivityEvent,
  ctx: ActivityContext,
  t: Translator,
  opts: FormatOptions,
): string {
  const empty = t("activity.diff.empty_value");
  const after = event.afterData ?? {};
  if ("status" in after) {
    return resolveStatusLabel(ctx, stringOrNull(after.status)) || empty;
  }
  if ("plannedPublishAt" in after) {
    return afterDate(after.plannedPublishAt, opts, empty);
  }
  if ("designerId" in after) {
    return resolveUserNameFromId(ctx, after.designerId, empty);
  }
  if ("contentOwnerId" in after) {
    return resolveUserNameFromId(ctx, after.contentOwnerId, empty);
  }
  if ("version" in after) {
    const version = after.version;
    if (typeof version === "number") {
      return t("activity.deliveryVersion", { version });
    }
  }
  if ("title" in after) {
    return stringOrNull(after.title) ?? empty;
  }
  if ("brief" in after) {
    return stringOrNull(after.brief) ?? empty;
  }
  if ("format" in after) {
    return stringOrNull(after.format) ?? empty;
  }
  if ("channelStatus" in after) {
    return t(`activity.publicationStatus.${stringOrNull(after.channelStatus) ?? "pending"}`);
  }
  return empty;
}

function beforeDate(value: unknown, opts: FormatOptions, empty: string): string {
  if (!value) return empty;
  try {
    return opts.formatDate(value as string | Date);
  } catch {
    return empty;
  }
}

// Reuse the date formatter for `after`.
function afterDate(value: unknown, opts: FormatOptions, empty: string): string {
  return beforeDate(value, opts, empty);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function resolveUserNameFromId(ctx: ActivityContext, value: unknown, empty: string): string {
  if (!value) return empty;
  if (typeof value !== "string") return empty;
  return ctx.userById.get(value)?.name ?? empty;
}

// ─── Diff builder ─────────────────────────────────────────────────

function buildDiff(
  event: RawActivityEvent,
  ctx: ActivityContext,
  t: Translator,
  opts: FormatOptions,
): ActivityDiff | null {
  const kind = event.kind;
  const before = event.beforeData;
  const after = event.afterData;

  // Text-shaped diffs (long-form content)
  if (
    kind === "brief_updated" ||
    kind === "title_updated" ||
    kind === "content_updated" ||
    kind === "content_copy_patched"
  ) {
    const field = fieldKeyForKind(kind) ?? "title";
    const beforeText = stringOrNull(before?.brief ?? before?.title ?? before?.text) ?? "";
    const afterText = stringOrNull(after?.brief ?? after?.title ?? after?.text) ?? "";
    return {
      field,
      fieldLabel: t(`activity.diff.${field}`),
      before: { label: beforeText },
      after: { label: afterText },
      shape: "text",
      unchanged: beforeText === afterText,
    };
  }

  // Chip-shaped diffs (status transitions, reschedules, assignments)
  if (kind === "status_transition") {
    const beforeLabel = stringOrNull(before?.status) ?? "";
    const afterLabel = stringOrNull(after?.status) ?? "";
    return {
      field: "status",
      fieldLabel: t("activity.diff.status"),
      before: { label: resolveStatusLabel(ctx, beforeLabel) },
      after: { label: resolveStatusLabel(ctx, afterLabel) },
      shape: "chip",
      unchanged: beforeLabel === afterLabel,
    };
  }

  if (kind === "schedule_change" || kind === "date_updated") {
    const beforeIso = stringOrNull(before?.plannedPublishAt);
    const afterIso = stringOrNull(after?.plannedPublishAt);
    return {
      field: "date",
      fieldLabel: t("activity.diff.date"),
      before: { label: beforeIso ? opts.formatDate(beforeIso) : t("activity.diff.empty_value") },
      after: { label: afterIso ? opts.formatDate(afterIso) : t("activity.diff.empty_value") },
      shape: "chip",
      unchanged: beforeIso === afterIso,
    };
  }

  if (kind === "assignment") {
    const beforeId = stringOrNull(before?.designerId);
    const afterId = stringOrNull(after?.designerId);
    const beforeName = beforeId
      ? (ctx.userById.get(beforeId)?.name ?? t("activity.diff.empty_value"))
      : t("activity.diff.empty_value");
    const afterName = afterId
      ? (ctx.userById.get(afterId)?.name ?? t("activity.diff.empty_value"))
      : t("activity.diff.empty_value");
    return {
      field: "designer",
      fieldLabel: t("activity.diff.designer"),
      before: { label: beforeName },
      after: { label: afterName },
      shape: "chip",
      unchanged: beforeId === afterId,
    };
  }

  if (kind === "publication") {
    const beforeStatus = stringOrNull(before?.channelStatus) ?? stringOrNull(before?.status) ?? "";
    const afterStatus = stringOrNull(after?.channelStatus) ?? stringOrNull(after?.status) ?? "";
    return {
      field: "channelStatus",
      fieldLabel: t("activity.diff.channelStatus"),
      before: { label: t(`activity.publicationStatus.${beforeStatus || "pending"}`) },
      after: { label: t(`activity.publicationStatus.${afterStatus || "pending"}`) },
      shape: "chip",
      unchanged: beforeStatus === afterStatus,
    };
  }

  return null;
}

function fieldKeyForKind(kind: string): string | null {
  switch (kind) {
    case "brief_updated":
      return "brief";
    case "title_updated":
      return "title";
    case "content_updated":
    case "content_copy_patched":
      return "brief";
    default:
      return null;
  }
}

// ─── Metadata label (e.g. channel name for publication events) ──

function buildMetadataLabel(
  event: RawActivityEvent,
  ctx: ActivityContext,
  t: Translator,
): string | null {
  const meta = event.metadata ?? {};
  const channelId =
    typeof meta.contentItemChannelId === "string" ? meta.contentItemChannelId : null;
  if (channelId) {
    return resolveChannelLabel(ctx, channelId, t("activity.unknownChannel"));
  }
  // Delivery: V1 / V2 metadata
  if (typeof meta.version === "number") {
    return t("activity.deliveryVersion", { version: meta.version });
  }
  return null;
}

// ─── Icon mapping ─────────────────────────────────────────────────

const KIND_ICON_MAP: Record<string, ActivityIconKind> = {
  status_transition: "status_transition",
  brief_updated: "field_edit",
  title_updated: "field_edit",
  date_updated: "schedule",
  content_updated: "field_edit",
  content_copy_patched: "field_edit",
  delivery: "delivery",
  delivery_submitted: "delivery",
  publication: "publication",
  publication_recorded: "publication",
  blocked: "blocked",
  claimed: "claimed",
  assignment: "claimed",
  schedule_change: "schedule",
  bulk_archive: "archive",
  bulk_delete: "delete",
  create: "create",
  update: "field_edit",
  delete: "delete",
  archive: "archive",
  restore: "update",
  comment: "comment",
  review: "comment",
  approval: "status_transition",
  approval_reset: "status_transition",
  changes_requested: "blocked",
  invitation: "claimed",
  ai_assistance: "ai",
  system: "system",
  brand: "brand",
};

export function iconForKind(kind: string): ActivityIconKind {
  if (kind.startsWith("brand.")) return "brand";
  return KIND_ICON_MAP[kind] ?? "system";
}

// ─── Tone mapping (Tailwind classes; semantic colors only) ────────

export function toneForKind(kind: string): string {
  if (kind.startsWith("brand.")) {
    return "border-info/30 bg-info-subtle text-info";
  }
  switch (kind) {
    case "status_transition":
    case "review":
    case "approval":
      return "border-primary/30 bg-primary-subtle text-primary";
    case "publication":
    case "publication_recorded":
    case "delivery":
    case "delivery_submitted":
      return "border-success/30 bg-success-subtle text-success";
    case "blocked":
    case "changes_requested":
    case "delete":
    case "bulk_delete":
      return "border-danger/30 bg-danger-subtle text-danger";
    case "ai_assistance":
    case "bulk_archive":
      return "border-warning/30 bg-warning-subtle text-warning";
    case "brief_updated":
    case "title_updated":
    case "date_updated":
    case "content_updated":
    case "content_copy_patched":
    case "schedule_change":
    case "update":
      return "border-info/30 bg-info-subtle text-info";
    case "comment":
      return "border-border bg-surface text-fg-secondary";
    case "claimed":
    case "assignment":
    case "invitation":
      return "border-primary/30 bg-primary-subtle text-primary";
    case "create":
    case "restore":
      return "border-success/30 bg-success-subtle text-success";
    case "archive":
      return "border-warning/30 bg-warning-subtle text-warning";
    case "system":
    default:
      return "border-border bg-surface text-fg-secondary";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────

/** Interpolate `{name}` placeholders in a template. Mirrors the
 *  project's i18n `interpolate()` semantics: missing placeholders
 *  are kept verbatim so the bug is visible. */
export function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name) => {
    const value = params[name];
    return value == null ? match : String(value);
  });
}

// Re-export humanizer for callers that want the icon / tone map.
export { humanStatus };
