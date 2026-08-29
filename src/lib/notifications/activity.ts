import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityEvents, users } from "@/lib/db/schema";
import { canAccessWorkspace, type Actor } from "@/lib/auth/policy";

/**
 * Activity timeline for a content item.
 *
 * Returns the most-recent `MAX_EVENTS` lifecycle events for
 * the item, joined to the actor's display name so the UI
 * doesn't need a second round-trip. The list excludes
 * `comment_created` (those live on the Discussion surface)
 * and pure audit events (security_audit_event); the planning
 * detail page renders lifecycle events only.
 *
 * Permission: the actor must be able to see the content
 * item, which is the same gate the page itself enforces
 * (`canAccessWorkspace` — workspace members + agency admins).
 */
const MAX_EVENTS = 50;

export async function listActivityEvents(actor: Actor, workspaceId: string, contentItemId: string) {
  await canAccessWorkspace(actor, workspaceId);
  const rows = await db
    .select({
      id: activityEvents.id,
      kind: activityEvents.kind,
      summary: activityEvents.summary,
      actorName: users.displayName,
      actorId: users.id,
      occurredAt: activityEvents.createdAt,
      metadata: activityEvents.metadata,
    })
    .from(activityEvents)
    .leftJoin(users, eq(users.id, activityEvents.actorId))
    .where(eq(activityEvents.contentItemId, contentItemId))
    .orderBy(desc(activityEvents.createdAt))
    .limit(MAX_EVENTS);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    summary: r.summary,
    actorName: r.actorName ?? r.actorId ?? "Unknown",
    occurredAt: r.occurredAt.toISOString(),
    metadata: r.metadata,
  }));
}
