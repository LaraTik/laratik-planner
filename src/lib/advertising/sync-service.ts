import { and, eq } from "drizzle-orm";
import type { db as appDb } from "@/lib/db";
import {
  advertisingAccounts,
  advertisingConnectionAccounts,
  advertisingConnectionAgencyAccess,
  advertisingConnections,
  advertisingSyncStates,
  securityAuditEvents,
} from "@/lib/db/schema";

type Db = typeof appDb;

export type AdvertisingSyncStatus =
  "idle" | "running" | "partial" | "failed" | "dead_letter" | "paused";

export class AdvertisingSyncInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdvertisingSyncInputError";
  }
}

/** Keep an in-flight job running when an already-enabled row is re-enabled. */
export function nextAdvertisingSyncStatus(
  current: AdvertisingSyncStatus | null,
  enabled: boolean,
): AdvertisingSyncStatus {
  if (!enabled) return "paused";
  return current === "running" ? "running" : "idle";
}

/**
 * Explicit agency-admin control for the durable sync state. This only changes
 * scheduling state; provider reads remain a separate, read-only worker seam.
 */
export async function setAdvertisingSyncState(
  db: Db,
  args: {
    agencyId: string;
    connectionId: string;
    accountId: string;
    enabled: boolean;
    actorId: string;
  },
) {
  return db.transaction(async (tx) => {
    const connection = (
      await tx
        .select({
          id: advertisingConnections.id,
          status: advertisingConnections.status,
          agencyId: advertisingConnections.agencyId,
          ownerType: advertisingConnections.ownerType,
        })
        .from(advertisingConnections)
        .where(and(eq(advertisingConnections.id, args.connectionId)))
        .limit(1)
    )[0];
    if (!connection) throw new AdvertisingSyncInputError("advertising_connection_not_found");
    if (connection.agencyId !== args.agencyId) {
      const [access] = await tx
        .select({ id: advertisingConnectionAgencyAccess.id })
        .from(advertisingConnectionAgencyAccess)
        .where(
          and(
            eq(advertisingConnectionAgencyAccess.connectionId, args.connectionId),
            eq(advertisingConnectionAgencyAccess.agencyId, args.agencyId),
            eq(advertisingConnectionAgencyAccess.status, "active"),
          ),
        )
        .limit(1);
      if (connection.ownerType !== "platform" || !access)
        throw new AdvertisingSyncInputError("advertising_connection_not_authorized");
    }

    const account = (
      await tx
        .select({ id: advertisingAccounts.id, status: advertisingAccounts.status })
        .from(advertisingAccounts)
        .where(
          and(
            eq(advertisingAccounts.id, args.accountId),
            eq(advertisingAccounts.agencyId, args.agencyId),
          ),
        )
        .limit(1)
    )[0];
    if (!account) throw new AdvertisingSyncInputError("advertising_account_not_in_agency");

    const connectionAccount = (
      await tx
        .select({ status: advertisingConnectionAccounts.status })
        .from(advertisingConnectionAccounts)
        .where(
          and(
            eq(advertisingConnectionAccounts.connectionId, args.connectionId),
            eq(advertisingConnectionAccounts.accountId, args.accountId),
          ),
        )
        .limit(1)
    )[0];
    if (!connectionAccount || connectionAccount.status !== "active")
      throw new AdvertisingSyncInputError("advertising_connection_account_not_active");
    if (args.enabled && connection.status !== "active")
      throw new AdvertisingSyncInputError("advertising_connection_not_active");
    if (args.enabled && account.status !== "active")
      throw new AdvertisingSyncInputError("advertising_account_not_active");

    const existing = (
      await tx
        .select()
        .from(advertisingSyncStates)
        .where(
          and(
            eq(advertisingSyncStates.connectionId, args.connectionId),
            eq(advertisingSyncStates.accountId, args.accountId),
          ),
        )
        .limit(1)
    )[0];
    const status = nextAdvertisingSyncStatus(
      (existing?.status as AdvertisingSyncStatus | undefined) ?? null,
      args.enabled,
    );
    const now = new Date();
    const values = {
      connectionId: args.connectionId,
      accountId: args.accountId,
      status,
      nextRunAt: args.enabled ? now : null,
      ...(args.enabled ? { lastErrorCode: null } : {}),
      ...(args.enabled && existing?.status === "dead_letter" ? { attempt: 0 } : {}),
      updatedAt: now,
    };
    const [state] = existing
      ? await tx
          .update(advertisingSyncStates)
          .set(values)
          .where(eq(advertisingSyncStates.id, existing.id))
          .returning()
      : await tx.insert(advertisingSyncStates).values(values).returning();
    if (!state) throw new Error("Advertising sync state was not persisted");

    await tx.insert(securityAuditEvents).values({
      actorId: args.actorId,
      action: args.enabled ? "advertising.sync.activated" : "advertising.sync.disabled",
      targetType: "advertising_sync_state",
      targetId: state.id,
      outcome: "success",
      metadata: {
        agencyId: args.agencyId,
        connectionId: args.connectionId,
        accountId: args.accountId,
        status,
      },
    });
    return state;
  });
}
