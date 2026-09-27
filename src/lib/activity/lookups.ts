import type { ActivityContext } from "./types";

/**
 * Activity context lookups — PURE.
 *
 * These are the Map-read helpers the formatter uses to turn ids
 * into display strings. Every one of them is a
 * `ctx.someMap.get(id) ?? fallback` read against a context that
 * was already built server-side, so none of them touch `db`,
 * `next/headers`, or anything else that requires a Server
 * Component.
 *
 * Why this module exists (and why it is separate from
 * `./resolve`):
 *
 *   `./resolve` legitimately needs `import "server-only"` — its
 *   `buildActivityContext()` batches real `db` queries. But
 *   `./format` is imported by `activity-timeline.tsx`, which is
 *   a `"use client"` component. When `format.ts` reached into
 *   `resolve.ts` for these helpers, the `server-only` marker
 *   propagated into the client bundle and `next build` failed
 *   with:
 *
 *     You're importing a module that depends on "server-only".
 *     This API is only available in Server Components in the App
 *     Router, but you are using it in the Pages Router.
 *
 *   Keeping the pure readers here lets both sides share one
 *   implementation: the client formatter imports this module, the
 *   server resolver re-exports it for existing callers.
 *
 * Contract: if you ever need to add a helper here, it MUST stay
 * pure — no `db`, no `await`, no `headers()`, no `server-only`.
 * That is the whole reason this file is separate.
 */

/** Look up a user by id; returns a fallback for unknown / null. */
export function resolveActorName(
  ctx: Pick<ActivityContext, "userById">,
  actorId: string | null | undefined,
  fallback: string,
): string {
  if (!actorId) return fallback;
  return ctx.userById.get(actorId)?.name ?? fallback;
}

/** Look up a user by id; returns a fallback for unknown / null. */
export function resolveActorEmail(
  ctx: Pick<ActivityContext, "userById">,
  actorId: string | null | undefined,
): string | null {
  if (!actorId) return null;
  return ctx.userById.get(actorId)?.email ?? null;
}

/** Look up a status by enum value; returns the raw enum if unknown. */
export function resolveStatusLabel(
  ctx: Pick<ActivityContext, "statusLabels">,
  status: string | null | undefined,
): string {
  if (!status) return "";
  return ctx.statusLabels.get(status) ?? status;
}

/** Look up a social channel by `contentItemChannelId`; returns a
 *  fallback for unknown / null. The `platform` is included in the
 *  fallback so the formatter can still produce a meaningful label. */
export function resolveChannelLabel(
  ctx: Pick<ActivityContext, "channelByContentItemChannelId">,
  contentItemChannelId: string | null | undefined,
  fallback: string,
): string {
  if (!contentItemChannelId) return fallback;
  return ctx.channelByContentItemChannelId.get(contentItemChannelId)?.label ?? fallback;
}

/** Best-effort: the active designer for a content item. */
export function resolveDesignerName(
  ctx: Pick<ActivityContext, "designerByContentItemId">,
  contentItemId: string | null | undefined,
): { id: string; name: string } | null {
  if (!contentItemId) return null;
  return ctx.designerByContentItemId.get(contentItemId) ?? null;
}

/** Best-effort: the active owner for a content item. */
export function resolveOwnerName(
  ctx: Pick<ActivityContext, "ownerByContentItemId">,
  contentItemId: string | null | undefined,
): { id: string; name: string } | null {
  if (!contentItemId) return null;
  return ctx.ownerByContentItemId.get(contentItemId) ?? null;
}
