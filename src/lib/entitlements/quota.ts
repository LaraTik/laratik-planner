import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { agencyUsageCounters, agencyUsageThresholdEvents } from "@/lib/db/schema";
import { getLimitForResource } from "@/lib/usage/get-limit-for-resource";
import { computeLevel, severityOf, THRESHOLD_LEVELS } from "@/lib/usage/threshold";
import { LimitExceededError } from "./types";
import { currentCounterValue } from "@/lib/usage/period";

export type CapacityAllocation = { resource: string; increase: number };

function resourceMessage(resource: string, limit: number): string {
  if (resource.startsWith("social_profiles:")) {
    const platform = resource.slice("social_profiles:".length);
    const name = `${platform.charAt(0).toUpperCase()}${platform.slice(1)}`;
    return `Your plan allows ${limit} social profiles on ${name}. Archive one or request a limit change.`;
  }
  return `Your plan allows ${limit} ${resource.replaceAll("_", " ")}. Archive an existing item or request a limit change.`;
}

export function assertWithinLimit(
  resource: string,
  currentUsage: number,
  limit: number | null,
  requestedIncrease: number,
): void {
  if (requestedIncrease < 1 || !Number.isInteger(requestedIncrease)) {
    throw new Error("Capacity increases must be positive integers");
  }
  if (limit === null || currentUsage + requestedIncrease <= limit) return;
  throw new LimitExceededError({
    resource,
    currentUsage,
    limit,
    requestedIncrease,
    userMessage: resourceMessage(resource, limit),
  });
}

/** Reserve all requested resources inside the caller's transaction. */
export async function reserveCapacity(
  tx: NodePgDatabase,
  agencyId: string,
  allocations: readonly CapacityAllocation[],
): Promise<void> {
  const coalesced = new Map<string, number>();
  for (const allocation of allocations) {
    coalesced.set(
      allocation.resource,
      (coalesced.get(allocation.resource) ?? 0) + allocation.increase,
    );
  }
  const entries = [...coalesced.entries()].sort(([a], [b]) => a.localeCompare(b));
  const pending: Array<{ resource: string; next: number; limit: number | null }> = [];

  for (const [resource, increase] of entries) {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${agencyId} || '|' || ${resource}))`,
    );
    const [row] = await tx
      .select({
        current: agencyUsageCounters.currentValue,
        lastRecordedAt: agencyUsageCounters.lastRecordedAt,
      })
      .from(agencyUsageCounters)
      .where(
        and(
          eq(agencyUsageCounters.agencyId, agencyId),
          eq(agencyUsageCounters.resourceKey, resource),
        ),
      )
      .for("update")
      .limit(1);
    const current = row
      ? currentCounterValue(resource, Number(row.current), row.lastRecordedAt)
      : 0;
    const limit = await getLimitForResource(tx, agencyId, resource);
    assertWithinLimit(resource, current, limit, increase);
    pending.push({ resource, next: current + increase, limit });
  }

  const now = new Date();
  const cycleKey = now.toISOString().slice(0, 10);
  for (const item of pending) {
    await tx
      .insert(agencyUsageCounters)
      .values({
        agencyId,
        resourceKey: item.resource,
        currentValue: item.next,
        lastRecordedAt: now,
        lastUpdatedAt: now,
        version: 1,
      })
      .onConflictDoUpdate({
        target: [agencyUsageCounters.agencyId, agencyUsageCounters.resourceKey],
        set: {
          currentValue: item.next,
          lastRecordedAt: now,
          lastUpdatedAt: now,
          version: sql`${agencyUsageCounters.version} + 1`,
        },
      });

    const level = computeLevel(item.next, item.limit);
    const percent = item.limit && item.limit > 0 ? (item.next / item.limit) * 100 : 0;
    for (let severity = 1; severity <= severityOf(level); severity += 1) {
      const thresholdLevel = THRESHOLD_LEVELS[severity - 1];
      if (!thresholdLevel) continue;
      await tx
        .insert(agencyUsageThresholdEvents)
        .values({
          agencyId,
          resource: item.resource,
          cycleKey,
          percent: percent.toFixed(2),
          level: thresholdLevel,
        })
        .onConflictDoNothing({
          target: [
            agencyUsageThresholdEvents.agencyId,
            agencyUsageThresholdEvents.resource,
            agencyUsageThresholdEvents.level,
            agencyUsageThresholdEvents.cycleKey,
          ],
        });
    }
  }
}

export async function releaseCapacity(
  tx: NodePgDatabase,
  agencyId: string,
  resources: readonly string[],
): Promise<void> {
  for (const resource of [...new Set(resources)].sort()) {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${agencyId} || '|' || ${resource}))`,
    );
    await tx
      .update(agencyUsageCounters)
      .set({
        currentValue: sql`GREATEST(${agencyUsageCounters.currentValue} - 1, 0)`,
        lastRecordedAt: new Date(),
        lastUpdatedAt: new Date(),
        version: sql`${agencyUsageCounters.version} + 1`,
      })
      .where(
        and(
          eq(agencyUsageCounters.agencyId, agencyId),
          eq(agencyUsageCounters.resourceKey, resource),
        ),
      );
  }
}
