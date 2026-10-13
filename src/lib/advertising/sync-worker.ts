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
  advertisingVisibilityGrants,
} from "@/lib/db/schema";
import { createMetaReadClient } from "./meta-http";
import {
  normalizeMetaAccountInsights,
  normalizeMetaAdInsights,
  normalizeMetaBreakdownInsights,
  sumSpendValues,
} from "./meta-ingestion";
import type { AdvertisingSpendObservationInput } from "./ingestion-service";
import {
  buildSpendReconciliation,
  type AdvertisingLease,
  AdvertisingLeaseLostError,
  ingestAdvertisingSpend,
  ingestAdvertisingAudience,
  upsertAdvertisingReconciliation,
} from "./ingestion-service";
import { persistAdvertisingProviderObjects } from "./connection-service";
import { resolveAdvertisingCredential } from "./credential-service";
import {
  classifyMetaError,
  createMetaAdvertisingProvider,
  type MetaAdvertisingProvider,
} from "./providers/meta";
import type { AdvertisingAccount, AdvertisingConnection, AdvertisingReportContext } from "./types";

type Db = typeof appDb;

const BATCH_LIMIT = 10;
const LEASE_MS = 50_000;
const RETRY_DELAYS_MINUTES = [15, 60, 360] as const;
export const ADVERTISING_SYNC_MAX_ATTEMPTS = RETRY_DELAYS_MINUTES.length + 1;
export const SUPPORTED_META_AUDIENCE_BREAKDOWNS = [
  "age",
  "gender",
  "placement",
  "device_platform",
  "country",
  "region",
] as const;

export type ClaimedSync = {
  stateId: string;
  agencyId: string;
  connection: AdvertisingConnection & { graphApiVersion: string | null };
  account: AdvertisingAccount;
  leaseToken: string;
  attempt: number;
};

/** Injectable provider boundary used by recovery tests; cron uses the Meta adapter. */
export type AdvertisingSyncProviderFactory = (target: ClaimedSync) => MetaAdvertisingProvider;

export type AdvertisingSyncTickResult = {
  claimed: number;
  succeeded: number;
  partial: number;
  failed: number;
  dead_letter: number;
  skipped: number;
};

export function nextAdvertisingRetryAt(now: Date, attempt: number): Date {
  const index = Math.min(Math.max(attempt - 1, 0), RETRY_DELAYS_MINUTES.length - 1);
  return addMinutes(now, RETRY_DELAYS_MINUTES[index] ?? RETRY_DELAYS_MINUTES[0]);
}

export function advertisingSyncFailureStatus(attempt: number): "failed" | "dead_letter" {
  return attempt >= ADVERTISING_SYNC_MAX_ATTEMPTS ? "dead_letter" : "failed";
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
  args: {
    now?: Date;
    owner?: string;
    limit?: number;
    providerFactory?: AdvertisingSyncProviderFactory;
    dateRange?: { since: string; until: string };
  } = {},
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
    dead_letter: 0,
    skipped: 0,
  };
  for (const target of claimed) {
    const outcome = await runOneAdvertisingSync(
      db,
      target,
      args.now ?? new Date(),
      args.providerFactory,
      args.dateRange,
    );
    result[outcome] += 1;
  }
  return result;
}

async function runOneAdvertisingSync(
  db: Db,
  target: ClaimedSync,
  now: Date,
  providerFactory?: AdvertisingSyncProviderFactory,
  dateRange?: { since: string; until: string },
) {
  let syncRun: { id: string };
  try {
    syncRun = await createAdvertisingSyncRun(db, target);
  } catch (error) {
    if (error instanceof AdvertisingLeaseLostError) return "skipped" as const;
    throw error;
  }

  try {
    const provider = providerFactory
      ? providerFactory(target)
      : createMetaAdvertisingProvider(
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
    const context = buildAdContext(target.account, now, dateRange);
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
    const objectSync = await syncProviderObjects(db, target, provider, syncRun.id);
    const audienceSync = await syncAudience(db, target, provider, syncRun.id, context);

    const accountContext: AdvertisingReportContext = { ...context, grain: "account_day" };
    const accountResponse = await provider.readDailyInsights(
      target.connection,
      target.account,
      accountContext,
    );
    const accountInsights = normalizeMetaAccountInsights(accountResponse);
    const grantRows = await db
      .select({
        workspaceId: advertisingVisibilityGrants.workspaceId,
        campaignIds: advertisingVisibilityGrants.campaignIds,
        adSetIds: advertisingVisibilityGrants.adSetIds,
        adIds: advertisingVisibilityGrants.adIds,
        startsAt: advertisingVisibilityGrants.startsAt,
        endsAt: advertisingVisibilityGrants.endsAt,
        revokedAt: advertisingVisibilityGrants.revokedAt,
      })
      .from(advertisingVisibilityGrants)
      .where(
        and(
          eq(advertisingVisibilityGrants.agencyId, target.agencyId),
          eq(advertisingVisibilityGrants.accountId, target.account.id),
          lte(advertisingVisibilityGrants.startsAt, now),
          or(
            isNull(advertisingVisibilityGrants.endsAt),
            gt(advertisingVisibilityGrants.endsAt, now),
          ),
          isNull(advertisingVisibilityGrants.revokedAt),
        ),
      );
    for (const accountRow of accountInsights.rows) {
      const dayObservations = adInsights.observations.filter(
        (observation) => observation.reportDate === accountRow.reportDate,
      );
      const canonical = sumSpendValues(dayObservations.map((observation) => observation.spend));
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
          workspaceAttributedSpend: attributedSpendForDate(
            dayObservations,
            grantRows,
            accountRow.reportDate,
          ),
          completeness:
            adInsights.partial ||
            accountInsights.partial ||
            objectSync.partial ||
            audienceSync.partial
              ? "partial"
              : "complete",
        }),
      });
    }

    const partial =
      adInsights.partial || accountInsights.partial || objectSync.partial || audienceSync.partial;
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
    const failureStatus = await failAdvertisingSync(db, target, now, errorCode);
    return failureStatus;
  }
}

async function syncProviderObjects(
  db: Db,
  target: ClaimedSync,
  provider: MetaAdvertisingProvider,
  syncRunId: string,
): Promise<{ partial: boolean }> {
  let partial = false;
  try {
    const campaigns = await provider.readCampaigns(target.connection, target.account);
    await persistAdvertisingProviderObjects(db, {
      agencyId: target.agencyId,
      accountId: target.account.id,
      connectionId: target.connection.id,
      syncRunId,
      objectType: "campaign",
      rows: campaigns,
    });
    for (const campaign of collectionRows(campaigns).slice(0, 10)) {
      const campaignId = stringValue(campaign.id);
      if (!campaignId) continue;
      const adsets = await provider.readAdSets(target.connection, campaignId);
      await persistAdvertisingProviderObjects(db, {
        agencyId: target.agencyId,
        accountId: target.account.id,
        connectionId: target.connection.id,
        syncRunId,
        objectType: "adset",
        parentExternalObjectId: campaignId,
        rows: adsets,
      });
      for (const adset of collectionRows(adsets).slice(0, 10)) {
        const adsetId = stringValue(adset.id);
        if (!adsetId) continue;
        const ads = await provider.readAds(target.connection, adsetId);
        await persistAdvertisingProviderObjects(db, {
          agencyId: target.agencyId,
          accountId: target.account.id,
          connectionId: target.connection.id,
          syncRunId,
          objectType: "ad",
          parentExternalObjectId: adsetId,
          rows: ads,
        });
        for (const ad of collectionRows(ads).slice(0, 10)) {
          const adId = stringValue(ad.id);
          if (!adId) continue;
          const creative = await provider.readCreatives(target.connection, adId);
          await persistAdvertisingProviderObjects(db, {
            agencyId: target.agencyId,
            accountId: target.account.id,
            connectionId: target.connection.id,
            syncRunId,
            objectType: "creative",
            parentExternalObjectId: adId,
            rows: creative,
          });
        }
      }
    }
  } catch {
    // Object metadata is an additive analytics projection. A provider object
    // failure must surface as partial while preserving canonical spend facts.
    partial = true;
  }
  return { partial };
}

async function syncAudience(
  db: Db,
  target: ClaimedSync,
  provider: MetaAdvertisingProvider,
  syncRunId: string,
  baseContext: AdvertisingReportContext,
): Promise<{ partial: boolean }> {
  let partial = false;
  for (const breakdown of SUPPORTED_META_AUDIENCE_BREAKDOWNS) {
    try {
      const context: AdvertisingReportContext = {
        ...baseContext,
        breakdowns: [breakdown],
        grain: "account_day",
      };
      const response = await provider.readBreakdowns(target.connection, target.account, context);
      const normalized = normalizeMetaBreakdownInsights(response, context);
      if (normalized.observations.length === 0) {
        if (normalized.skippedRows > 0) partial = true;
        continue;
      }
      const written = await ingestAdvertisingAudience(db, {
        agencyId: target.agencyId,
        accountId: target.account.id,
        connectionId: target.connection.id,
        syncRunId,
        lease: leaseFor(target),
        observations: normalized.observations,
      });
      if (normalized.partial || written.written < normalized.observations.length) partial = true;
    } catch {
      partial = true;
    }
  }
  return { partial };
}

function collectionRows(value: unknown): readonly Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (isRecord(value) && Array.isArray(value.data)) return value.data.filter(isRecord);
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

type AttributionGrant = {
  campaignIds: readonly string[] | null;
  adSetIds: readonly string[] | null;
  adIds: readonly string[] | null;
};

export function attributedSpendForDate(
  observations: readonly AdvertisingSpendObservationInput[],
  grants: readonly AttributionGrant[],
  reportDate: string,
): string {
  const attributed = observations.filter(
    (observation) =>
      observation.reportDate === reportDate &&
      grants.some(
        (grant) =>
          (grant.campaignIds === null ||
            (observation.externalCampaignId !== null &&
              observation.externalCampaignId !== undefined &&
              grant.campaignIds.includes(observation.externalCampaignId))) &&
          (grant.adSetIds === null ||
            (observation.externalAdSetId !== null &&
              observation.externalAdSetId !== undefined &&
              grant.adSetIds.includes(observation.externalAdSetId))) &&
          (grant.adIds === null || grant.adIds.includes(observation.externalAdId)),
      ),
  );
  return sumSpendValues(attributed.map((observation) => observation.spend));
}

/** Create run history only while this worker still owns the fencing token. */
export async function createAdvertisingSyncRun(
  db: Db,
  target: Pick<ClaimedSync, "stateId" | "connection" | "account" | "leaseToken">,
) {
  return db.transaction(async (tx) => {
    const [lease] = await tx
      .select({ id: advertisingSyncStates.id })
      .from(advertisingSyncStates)
      .where(
        and(
          eq(advertisingSyncStates.id, target.stateId),
          eq(advertisingSyncStates.leaseToken, target.leaseToken),
          gt(advertisingSyncStates.leaseExpiresAt, new Date()),
        ),
      )
      .for("update")
      .limit(1);
    if (!lease) throw new AdvertisingLeaseLostError();

    const [syncRun] = await tx
      .insert(advertisingSyncRuns)
      .values({
        syncStateId: target.stateId,
        connectionId: target.connection.id,
        accountId: target.account.id,
        status: "running",
      })
      .returning({ id: advertisingSyncRuns.id });
    if (!syncRun) throw new Error("Advertising sync run was not persisted");
    return syncRun;
  });
}

function leaseFor(target: ClaimedSync): AdvertisingLease {
  return { stateId: target.stateId, leaseToken: target.leaseToken };
}

export function buildAdContext(
  account: AdvertisingAccount,
  now: Date,
  dateRange?: { since: string; until: string },
): AdvertisingReportContext {
  const until = now.toISOString().slice(0, 10);
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return {
    definitionVersion: "meta-read-v1",
    provider: "meta",
    accountId: account.externalAccountId,
    currency: account.currency,
    timezone: account.timezone,
    dateRange: dateRange ?? { since, until },
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

export async function failAdvertisingSync(
  db: Db,
  target: ClaimedSync,
  now: Date,
  errorCode: string,
) {
  const leaseNow = new Date();
  const status = advertisingSyncFailureStatus(target.attempt);
  await db
    .update(advertisingSyncStates)
    .set({
      status,
      nextRunAt: status === "dead_letter" ? null : nextAdvertisingRetryAt(now, target.attempt),
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
  return status;
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
