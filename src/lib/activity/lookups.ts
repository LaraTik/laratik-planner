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

/**
 * Coerce a `beforeData` / `afterData` / `metadata` payload into a
 * plain record, or `{}` when it is anything else.
 *
 * This is the **single** sanctioned reader for the `jsonb` payload
 * columns on `activity_event`, and it lives here (not in
 * `format.ts`) so the server resolver and the client formatter
 * share one implementation.
 *
 * Why it exists (incident 2026-09-27): those columns are `jsonb`,
 * so the runtime value is whatever the writer put there — and
 * `lib/publishing/materiality.ts::recordMaterialityEvent` stored
 * **bare scalars** (an ISO date string for `schedule`, the caption
 * text for `caption`, the literal `"(payload)"` for
 * `platform_payload`) instead of an object. It coerced only `null`,
 * and an `as never` cast silenced the Drizzle type check that
 * would have caught it.
 *
 * The formatter then ran `"status" in before` against a *string*:
 *
 *     TypeError: Cannot use 'in' operator to search for
 *     'status' in 2026-09-26T21:00:00.000Z
 *
 * Because `buildVerb` computes before/after labels for **every**
 * event regardless of `kind`, one malformed historical row took
 * down the entire planning-detail route and the workspace activity
 * feed instead of degrading to one ugly row. 12 of 83 production
 * content items were affected.
 *
 * `?? {}` is NOT sufficient — a string is not nullish, so it sails
 * straight through to the `in` operator. Nor is `Object.values()`
 * (it returns the characters of a string). Every read of these
 * columns must go through this helper.
 */
export function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

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
