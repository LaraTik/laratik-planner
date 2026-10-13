import { randomUUID } from "node:crypto";
import { addMinutes } from "date-fns";
import { and, asc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import type { db as appDb } from "@/lib/db";
import {
  advertisingAccounts,
  advertisingConnectionAccounts,
  advertisingConnections,
  advertisingSyncRuns,
  advertisingSyncStates,
} from "@/lib/db/schema";
import { createMetaReadClient } from "./meta-http";
import {
  normalizeMetaAccountInsights,
  normalizeMetaAdInsights,
  sumSpendValues,
} from "./meta-ingestion";
import {
  buildSpendReconciliation,
  type AdvertisingLease,
  AdvertisingLeaseLostError,
  ingestAdvertisingSpend,
  upsertAdvertisingReconciliation,
} from "./ingestion-service";
import { resolveAdvertisingCredential } from "./credential-service";
import { classifyMetaError, createMetaAdvertisingProvider } from "./providers/meta";
import type { AdvertisingAccount, AdvertisingConnection, AdvertisingReportContext } from "./types";

type Db = typeof appDb;

const BATCH_LIMIT = 10;
const LEASE_MS = 50_000;
const RETRY_DELAYS_MINUTES = [15, 60, 360] as const;

type ClaimedSync = {
  stateId: string;
  agencyId: string;
  connection: AdvertisingConnection & { graphApiVersion: string | null };
  account: AdvertisingAccount;
  leaseToken: string;
  attempt: number;
};

export type AdvertisingSyncTickResult = {
  claimed: number;
  succeeded: number;
  partial: number;
  failed: number;
  skipped: number;
};

export function nextAdvertisingRetryAt(now: Date, attempt: number): Date {
  const index = Math.min(Math.max(attempt - 1, 0), RETRY_DELAYS_MINUTES.length - 1);
  return addMinutes(now, RETRY_DELAYS_MINUTES[index] ?? RETRY_DELAYS_MINUTES[0]);
}

/** Claim due states with row locks and a fencing token before any provider call. */
export async function claimAdvertisingSyncStates(
  db: Db,
  args: { owner: string; now?: Date; limit?: number } = { owner: `advertising:${randomUUID()}` },
): Promise<ClaimedSync[]> {
  const now = args.now ?? new Date();
  const limit = Math.min(args.limit ?? BATCH_LIMIT, BATCH_LIMIT);
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        state: advertisingSyncStates,
        connection: advertisingConnections,
        account: advertisingAccounts,
      })
      .from(advertisingSyncStates)
      .innerJoin(
        advertisingConnections,
        and(
          eq(advertisingConnections.id, advertisingSyncStates.connectionId),
          eq(advertisingConnections.status, "active"),
        ),
      )
      .innerJoin(
        advertisingConnectionAccounts,
        and(
          eq(advertisingConnectionAccounts.connectionId, advertisingSyncStates.connectionId),
          eq(advertisingConnectionAccounts.accountId, advertisingSyncStates.accountId),
          eq(advertisingConnectionAccounts.status, "active"),
        ),
      )
      .innerJoin(
        advertisingAccounts,
        and(
          eq(advertisingAccounts.id, advertisingSyncStates.accountId),
          eq(advertisingAccounts.status, "active"),
        ),
      )
      .where(
        and(
          or(
            eq(advertisingSyncStates.status, "idle"),
            eq(advertisingSyncStates.status, "partial"),
            eq(advertisingSyncStates.status, "failed"),
            and(
              eq(advertisingSyncStates.status, "running"),
              lte(advertisingSyncStates.leaseExpiresAt, now),
            ),
          ),
          or(
            eq(advertisingSyncStates.status, "running"),
            isNull(advertisingSyncStates.nextRunAt),
            lte(advertisingSyncStates.nextRunAt, now),
          ),
          or(
            isNull(advertisingSyncStates.leaseExpiresAt),
            lte(advertisingSyncStates.leaseExpiresAt, now),
          ),
        ),
      )
      .orderBy(asc(advertisingSyncStates.nextRunAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);
    const claimed: ClaimedSync[] = [];
    for (const row of rows) {
      const leaseToken = randomUUID();
      const [updated] = await tx
        .update(advertisingSyncStates)
        .set({
          status: "running",
          leaseOwner: args.owner,
          leaseToken,
          leaseExpiresAt,
          lastStartedAt: now,
          attempt: sql`${advertisingSyncStates.attempt} + 1`,
          updatedAt: now,
        })
        .where(eq(advertisingSyncStates.id, row.state.id))
        .returning({ attempt: advertisingSyncStates.attempt });
      if (!updated) continue;
      claimed.push({
        stateId: row.state.id,
        agencyId: row.connection.agencyId,
        connection: {
          id: row.connection.id,
          provider: "meta",
          agencyId: row.connection.agencyId,
          credentialRef: row.connection.credentialRef,
          status: "active",
          lastValidatedAt: row.connection.lastValidatedAt?.toISOString() ?? null,
          graphApiVersion: row.connection.graphApiVersion,
        },
        account: {
          id: row.account.id,
          provider: "meta",
          externalAccountId: row.account.externalAccountId,
          agencyId: row.account.agencyId,
          name: row.account.name,
          currency: row.account.currency ?? "",
          timezone: row.account.timezone ?? "",
          connectionId: row.connection.id,
          status: "active",
        },
        leaseToken,
        attempt: updated.attempt,
      });
    }
    return claimed;
  });
}

export async function runAdvertisingSyncTick(
  db: Db,
  args: { now?: Date; owner?: string; limit?: number } = {},
): Promise<AdvertisingSyncTickResult> {
  const claimed = await claimAdvertisingSyncStates(db, {
    owner: args.owner ?? `advertising:${randomUUID()}`,
    ...(args.now ? { now: args.now } : {}),
    ...(args.limit ? { limit: args.limit } : {}),
  });
  const result: AdvertisingSyncTickResult = {
    claimed: claimed.length,
    succeeded: 0,
    partial: 0,
    failed: 0,
    skipped: 0,
  };
  for (const target of claimed) {
    const outcome = await runOneAdvertisingSync(db, target, args.now ?? new Date());
    result[outcome] += 1;
  }
  return result;
}

async function runOneAdvertisingSync(db: Db, target: ClaimedSync, now: Date) {
  const [syncRun] = await db
    .insert(advertisingSyncRuns)
    .values({
      syncStateId: target.stateId,
      connectionId: target.connection.id,
      accountId: target.account.id,
      status: "running",
    })
    .returning({ id: advertisingSyncRuns.id });
  if (!syncRun) return "skipped" as const;

  try {
    const provider = createMetaAdvertisingProvider(
      {
        resolve: (credentialRef) => {
          if (credentialRef !== target.connection.credentialRef)
            throw new Error("credential_reference_mismatch");
          return resolveAdvertisingCredential(db, {
            agencyId: target.agencyId,
            connectionId: target.connection.id,
          });
        },
      },
      (credential) => createMetaReadClient(target.connection.graphApiVersion, credential),
    );
    const context = buildAdContext(target.account, now);
    const adResponse = await provider.readDailyInsights(target.connection, target.account, context);
    const adInsights = normalizeMetaAdInsights(adResponse, context);
    const written = await ingestAdvertisingSpend(db, {
      agencyId: target.agencyId,
      accountId: target.account.id,
      connectionId: target.connection.id,
      syncRunId: syncRun.id,
      providerDataVersion: context.definitionVersion,
      lease: leaseFor(target),
      observations: adInsights.observations,
    });

    const accountContext: AdvertisingReportContext = { ...context, grain: "account_day" };
    const accountResponse = await provider.readDailyInsights(
      target.connection,
      target.account,
      accountContext,
    );
    const accountInsights = normalizeMetaAccountInsights(accountResponse);
    for (const accountRow of accountInsights.rows) {
      const canonical = sumSpendValues(
        adInsights.observations
          .filter((observation) => observation.reportDate === accountRow.reportDate)
          .map((observation) => observation.spend),
      );
      await upsertAdvertisingReconciliation(db, {
        agencyId: target.agencyId,
        accountId: target.account.id,
        reportDate: accountRow.reportDate,
        currency: target.account.currency,
        attributionWindow: context.attributionWindow ?? "account",
        lease: leaseFor(target),
        reconciliation: buildSpendReconciliation({
          providerAccountSpend: accountRow.spend,
          canonicalAdSpend: canonical,
          workspaceAttributedSpend: "0",
          completeness: adInsights.partial || accountInsights.partial ? "partial" : "complete",
        }),
      });
    }

    const partial = adInsights.partial || accountInsights.partial;
    await db
      .update(advertisingSyncRuns)
      .set({
        status: partial ? "partial" : "succeeded",
        rowsRead: adInsights.observations.length,
        rowsWritten: written.written,
        partial,
        completedAt: now,
      })
      .where(eq(advertisingSyncRuns.id, syncRun.id));
    const finished = await finishAdvertisingSync(db, target, now, partial ? "partial" : "idle");
    if (!finished) {
      await markSyncRunLeaseLost(db, syncRun.id, now);
      return "skipped" as const;
    }
    return partial ? ("partial" as const) : ("succeeded" as const);
  } catch (error) {
    if (error instanceof AdvertisingLeaseLostError) {
      await markSyncRunLeaseLost(db, syncRun.id, now);
      return "skipped" as const;
    }
    const errorCode = advertisingSyncErrorCode(error);
    await db
      .update(advertisingSyncRuns)
      .set({ status: "failed", errorCode, completedAt: now })
      .where(eq(advertisingSyncRuns.id, syncRun.id));
    await failAdvertisingSync(db, target, now, errorCode);
    return "failed" as const;
  }
}

function leaseFor(target: ClaimedSync): AdvertisingLease {
  return { stateId: target.stateId, leaseToken: target.leaseToken };
}

function buildAdContext(account: AdvertisingAccount, now: Date): AdvertisingReportContext {
  const until = now.toISOString().slice(0, 10);
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return {
    definitionVersion: "meta-read-v1",
    provider: "meta",
    accountId: account.externalAccountId,
    currency: account.currency,
    timezone: account.timezone,
    dateRange: { since, until },
    attributionWindow: "account",
    actionReportTime: "impression",
    breakdowns: [],
    grain: "ad_day",
  };
}

async function finishAdvertisingSync(
  db: Db,
  target: ClaimedSync,
  now: Date,
  status: "idle" | "partial",
): Promise<boolean> {
  const leaseNow = new Date();
  const [updated] = await db
    .update(advertisingSyncStates)
    .set({
      status,
      lastCompletedAt: now,
      nextRunAt: addMinutes(now, 15),
      lastErrorCode: null,
      lastErrorAt: null,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      attempt: 0,
      updatedAt: now,
    })
    .where(
      and(
        eq(advertisingSyncStates.id, target.stateId),
        eq(advertisingSyncStates.leaseToken, target.leaseToken),
        gt(advertisingSyncStates.leaseExpiresAt, leaseNow),
      ),
    )
    .returning({ id: advertisingSyncStates.id });
  return Boolean(updated);
}

async function failAdvertisingSync(db: Db, target: ClaimedSync, now: Date, errorCode: string) {
  const leaseNow = new Date();
  await db
    .update(advertisingSyncStates)
    .set({
      status: "failed",
      nextRunAt: nextAdvertisingRetryAt(now, target.attempt),
      lastErrorCode: errorCode,
      lastErrorAt: now,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(advertisingSyncStates.id, target.stateId),
        eq(advertisingSyncStates.leaseToken, target.leaseToken),
        gt(advertisingSyncStates.leaseExpiresAt, leaseNow),
      ),
    );
}

async function markSyncRunLeaseLost(db: Db, syncRunId: string, now: Date) {
  await db
    .update(advertisingSyncRuns)
    .set({ status: "failed", errorCode: "advertising_lease_lost", completedAt: now })
    .where(eq(advertisingSyncRuns.id, syncRunId));
}

function advertisingSyncErrorCode(error: unknown): string {
  const candidate = error as { status?: unknown; code?: unknown };
  const status = typeof candidate.status === "number" ? candidate.status : 500;
  const code = typeof candidate.code === "number" ? candidate.code : undefined;
  return `meta_${classifyMetaError(status, code)}`;
}
