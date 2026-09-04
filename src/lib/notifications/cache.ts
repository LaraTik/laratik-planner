import "server-only";
import { unstable_cache } from "next/cache";
import { type Actor } from "@/lib/auth/policy";
import { countUnreadNotifications, listNotificationsForUser } from "@/lib/notifications/service";

/**
 * R9 — cache the bell's two server reads.
 *
 * The previous implementation called `listNotificationsForUser`
 * + `countUnreadNotifications` directly inside the (app) layout.
 * That re-ran on every request to any page under `/app/*` — 4
 * SQL round-trips per page load for two pieces of data the user
 * mostly ignores (the bell is a small popover).
 *
 * `unstable_cache` wraps each read in Next.js's request
 * memoisation. The cache key is the user id (notifications are
 * per-user) and the limit (the list caps at 10 today, but a
 * future change to a different cap must bust the cache).
 *
 * The cache is tagged `notifications:user:<actorId>` so the
 * mark-read action can invalidate exactly this user's bell
 * data without `revalidatePath("/app")` — which currently
 * invalidates every page under `/app/*` and forces the
 * planning detail / brand kit / calendar pages to refetch on
 * every bell click.
 *
 * Cross-user safety: `revalidateTag("notifications:user:A")`
 * only invalidates A's cache entry. B's entry stays warm.
 *
 * Cross-page safety: the layout is a Server Component shared
 * by every page under `/app/*`. The cache entry is shared
 * across all of them, which is the desired behaviour — the
 * bell renders the same data regardless of which page is
 * active.
 */

const NOTIFICATIONS_TAG_PREFIX = "notifications:user:";
const NOTIFICATIONS_LIST_KEY = (userId: string, limit: number) =>
  `notifications:list:${userId}:${limit}`;
const NOTIFICATIONS_COUNT_KEY = (userId: string) => `notifications:count:${userId}`;

function tagForUser(userId: string): string {
  return `${NOTIFICATIONS_TAG_PREFIX}${userId}`;
}

export const notificationsUserTag = tagForUser;

/**
 * Cached variant of `listNotificationsForUser`. Reads return
 * the latest snapshot from the in-memory cache; the cache is
 * invalidated by `revalidateTag(notificationsUserTag(userId))`
 * in the mark-read action + the outbox dispatcher's write
 * path.
 */
export const getCachedNotificationsForUser = (actor: Actor, limit: number = 10) =>
  unstable_cache(
    async () => listNotificationsForUser(actor, { limit }),
    [NOTIFICATIONS_LIST_KEY(actor.id, limit)],
    { tags: [tagForUser(actor.id)] },
  )();

/**
 * Cached variant of `countUnreadNotifications`. Same tag as
 * the list cache so a single `revalidateTag` call busts both.
 */
export const getCachedUnreadCount = (actor: Actor) =>
  unstable_cache(async () => countUnreadNotifications(actor), [NOTIFICATIONS_COUNT_KEY(actor.id)], {
    tags: [tagForUser(actor.id)],
  })();
