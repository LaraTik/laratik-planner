import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentAssignments, contentItemChannels, socialChannels, users } from "@/lib/db/schema";
import { humanStatus, humanFormat } from "@/lib/content/status";
import { resolveLocale } from "@/lib/i18n/locales";
import { tFor } from "@/messages";
import type { ActivityContext, RawActivityEvent } from "./types";

/**
 * The pure Map-read helpers live in `./lookups` (no `server-only`),
 * because `./format` is imported by a `"use client"` component and
 * importing them from this module would drag `server-only` into
 * the client bundle. They are re-exported here so server-side
 * callers of `@/lib/activity/resolve` keep a single import site.
 */
export {
  resolveActorName,
  resolveActorEmail,
  resolveStatusLabel,
  resolveChannelLabel,
  resolveDesignerName,
  resolveOwnerName,
} from "./lookups";

/**
 * Activity context resolver.
 *
 * Batches all the lookups the formatter needs (status names,
 * format names, user names, channel labels, designer / owner
 * names) into a single server-side pass per workspace per page
 * render. Page load is bounded; the worst case is one extra
 * round-trip per workspace-wide feed render.
 *
 * Missing IDs are intentional — the formatter must accept
 * `null` for any unresolved ID and degrade to a localised
 * "Unknown" label, with `data-*` testids so the regression is
 * visible in the test tree.
 */

/** Extract every distinct channel id the resolver needs to fetch.
 *  Walks `metadata`, `beforeData`, `afterData` looking for either
 *  `contentItemChannelId` (recordPublication style) or
 *  `channelId` (older emitter style). */
function collectChannelIds(events: readonly RawActivityEvent[]): string[] {
  const out = new Set<string>();
  for (const e of events) {
    const visit = (bag: Record<string, unknown> | null | undefined) => {
      if (!bag) return;
      const id = bag.contentItemChannelId ?? bag.channelId;
      if (typeof id === "string") out.add(id);
    };
    visit(e.metadata);
    visit(e.beforeData);
    visit(e.afterData);
  }
  return [...out];
}

/** Extract distinct content-item ids from events that have one
 *  in `metadata` or `targetId`. The per-item timeline already
 *  has one contentItemId; this is mainly for the workspace
 *  feed. */
function collectContentItemIds(events: readonly RawActivityEvent[]): string[] {
  const out = new Set<string>();
  for (const e of events) {
    if (e.targetId) out.add(e.targetId);
  }
  return [...out];
}

/** Extract every distinct user id we need a name for. */
function collectUserIds(events: readonly RawActivityEvent[]): string[] {
  const out = new Set<string>();
  for (const e of events) {
    if (e.actorId) out.add(e.actorId);
    const visit = (bag: Record<string, unknown> | null | undefined) => {
      if (!bag) return;
      for (const v of Object.values(bag)) {
        if (typeof v === "string" && looksLikeUuid(v)) out.add(v);
      }
    };
    visit(e.beforeData);
    visit(e.afterData);
  }
  return [...out];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function looksLikeUuid(s: string): boolean {
  return UUID_RE.test(s);
}

/** Build the per-workspace lookup maps. The function is
 *  read-only and does not mutate `db` state. Callers should
 *  pass only the events they are about to render so the lookup
 *  tables stay small. */
export async function buildActivityContext(
  workspaceId: string,
  rawEvents: readonly RawActivityEvent[],
  localeInput?: string | null,
): Promise<ActivityContext> {
  const { code } = resolveLocale(localeInput ?? null);
  const t = tFor(code);

  const userIds = collectUserIds(rawEvents);
  const channelIds = collectChannelIds(rawEvents);
  const itemIds = collectContentItemIds(rawEvents);

  // ── users ─────────────────────────────────────────────────────
  const userRows = userIds.length
    ? await db
        .select({ id: users.id, displayName: users.displayName, email: users.email })
        .from(users)
        .where(inArray(users.id, userIds))
    : [];
  const userById = new Map<string, { name: string; email: string | null }>();
  for (const u of userRows) {
    userById.set(u.id, {
      name: u.displayName?.trim() || u.email || t("activity.unknownActor"),
      email: u.email ?? null,
    });
  }

  // ── channels (join socialChannel for platform + accountName) ─
  const channelRows = channelIds.length
    ? await db
        .select({
          id: contentItemChannels.id,
          platform: socialChannels.platform,
          accountName: socialChannels.accountName,
        })
        .from(contentItemChannels)
        .innerJoin(socialChannels, eq(socialChannels.id, contentItemChannels.socialChannelId))
        .where(inArray(contentItemChannels.id, channelIds))
    : [];
  const channelByContentItemChannelId = new Map<string, { label: string; platform: string }>();
  for (const c of channelRows) {
    const platformLabel = t(`activity.platforms.${c.platform}`) ?? c.platform;
    channelByContentItemChannelId.set(c.id, {
      label: t("activity.channelLabel", { platform: platformLabel, accountName: c.accountName }),
      platform: c.platform,
    });
  }

  // ── designers + owners per content item ──────────────────────
  // Resolve the latest *active* assignment of each type per
  // content item. The cache is per-item so the formatter can
  // resolve `beforeData.designerId === currentDesignerId` to
  // a stable "Maya Cohen" label.
  const designerByContentItemId = new Map<string, { id: string; name: string } | null>();
  const ownerByContentItemId = new Map<string, { id: string; name: string } | null>();
  if (itemIds.length) {
    const assignmentRows = await db
      .select({
        contentItemId: contentAssignments.contentItemId,
        type: contentAssignments.assignmentType,
        userId: contentAssignments.userId,
        displayName: users.displayName,
        email: users.email,
      })
      .from(contentAssignments)
      .innerJoin(users, eq(users.id, contentAssignments.userId))
      .where(
        and(
          inArray(contentAssignments.contentItemId, itemIds),
          eq(contentAssignments.active, true),
          sql`${contentAssignments.releasedAt} IS NULL`,
        ),
      );
    for (const row of assignmentRows) {
      const target =
        row.type === "designer"
          ? designerByContentItemId
          : row.type === "owner"
            ? ownerByContentItemId
            : null;
      if (!target) continue;
      const entry = {
        id: row.userId,
        name: row.displayName?.trim() || row.email || t("activity.unknownActor"),
      };
      // The schema allows multiple active assignments per type
      // for the same content item (history). The most-recent one
      // wins; that's also what `contentItems.designerId` reads.
      if (!target.has(row.contentItemId)) {
        target.set(row.contentItemId, entry);
      }
    }
  }

  // ── localised enum labels ────────────────────────────────────
  const statusLabels = buildEnumLabelMap(
    [
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
    ],
    humanStatus,
  );
  const formatLabels = buildEnumLabelMap(
    [
      "static_post",
      "carousel",
      "story",
      "short_form_video",
      "long_form_video",
      "live_content",
      "article",
      "other",
    ],
    humanFormat,
  );

  return {
    workspaceId,
    statusLabels,
    formatLabels,
    userById,
    channelByContentItemChannelId,
    designerByContentItemId,
    ownerByContentItemId,
  };
}

function buildEnumLabelMap(
  values: readonly string[],
  humanize: (s: string) => string,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const v of values) map.set(v, humanize(v));
  return map;
}


// Suppress an unused-import warning when callers only use the type.
export type { LocaleCode } from "@/lib/i18n/locales";
