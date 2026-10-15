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
  type MetaCollectionCursor,
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
  cursor: string | null;
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

export function normalizeAdvertisingSyncDateRange(dateRange?: {
  since: string;
  until: string;
}): { since: string; until: string } | undefined {
  if (!dateRange) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRange.since) || !/^\d{4}-\d{2}-\d{2}$/.test(dateRange.until))
    throw new Error("advertising_sync_date_range_invalid");
  const since = new Date(`${dateRange.since}T00:00:00Z`);
  const until = new Date(`${dateRange.until}T00:00:00Z`);
  const days = (until.getTime() - since.getTime()) / 86_400_000;
  if (!Number.isFinite(days) || days < 0 || days > 366)
    throw new Error("advertising_sync_date_range_invalid");
  return dateRange;
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
        // Reporting and tenant-local projections follow the account's customer
        // agency; the connection's agency remains the credential owner.
        agencyId: row.account.agencyId,
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
        cursor: row.state.cursor,
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
  const dateRange = normalizeAdvertisingSyncDateRange(args.dateRange);
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
      dateRange,
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
    const adResponse = provider.readDailyInsightsComplete
      ? await provider.readDailyInsightsComplete(target.connection, target.account, context, {
          cursor: cursorFor(target, "ad_insights"),
          onPage: (next) => persistSyncCursor(db, target, "ad_insights", next),
        })
      : await provider.readDailyInsights(target.connection, target.account, context);
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
    const accountResponse = provider.readDailyInsightsComplete
      ? await provider.readDailyInsightsComplete(
          target.connection,
          target.account,
          accountContext,
          {
            cursor: cursorFor(target, "account_insights"),
            onPage: (next) => persistSyncCursor(db, target, "account_insights", next),
          },
        )
      : await provider.readDailyInsights(target.connection, target.account, accountContext);
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
            !collectionResponseComplete(adResponse) ||
            !collectionResponseComplete(accountResponse) ||
            accountInsights.partial ||
            objectSync.partial ||
            audienceSync.partial
              ? "partial"
              : "complete",
        }),
      });
    }

    const partial =
      adInsights.partial ||
      accountInsights.partial ||
      !collectionResponseComplete(adResponse) ||
      !collectionResponseComplete(accountResponse) ||
      objectSync.partial ||
      audienceSync.partial;
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
    const campaigns = provider.readCampaignsComplete
      ? await provider.readCampaignsComplete(target.connection, target.account, {
          cursor: cursorFor(target, "inventory:campaigns"),
          onPage: (next) => persistSyncCursor(db, target, "inventory:campaigns", next),
        })
      : await provider.readCampaigns(target.connection, target.account);
    if (!collectionResponseComplete(campaigns)) partial = true;
    await persistAdvertisingProviderObjects(db, {
      agencyId: target.agencyId,
      accountId: target.account.id,
      connectionId: target.connection.id,
      syncRunId,
      objectType: "campaign",
      rows: campaigns,
    });
    for (const campaign of collectionRows(campaigns)) {
      const campaignId = stringValue(campaign.id);
      if (!campaignId) continue;
      const adsets = provider.readAdSetsComplete
        ? await provider.readAdSetsComplete(target.connection, campaignId, {
            cursor: cursorFor(target, `inventory:adsets:${campaignId}`),
            onPage: (next) => persistSyncCursor(db, target, `inventory:adsets:${campaignId}`, next),
          })
        : await provider.readAdSets(target.connection, campaignId);
      if (!collectionResponseComplete(adsets)) partial = true;
      await persistAdvertisingProviderObjects(db, {
        agencyId: target.agencyId,
        accountId: target.account.id,
        connectionId: target.connection.id,
        syncRunId,
        objectType: "adset",
        parentExternalObjectId: campaignId,
        rows: adsets,
      });
      for (const adset of collectionRows(adsets)) {
        const adsetId = stringValue(adset.id);
        if (!adsetId) continue;
        const ads = provider.readAdsComplete
          ? await provider.readAdsComplete(target.connection, adsetId, {
              cursor: cursorFor(target, `inventory:ads:${adsetId}`),
              onPage: (next) => persistSyncCursor(db, target, `inventory:ads:${adsetId}`, next),
            })
          : await provider.readAds(target.connection, adsetId);
        if (!collectionResponseComplete(ads)) partial = true;
        await persistAdvertisingProviderObjects(db, {
          agencyId: target.agencyId,
          accountId: target.account.id,
          connectionId: target.connection.id,
          syncRunId,
          objectType: "ad",
          parentExternalObjectId: adsetId,
          rows: ads,
        });
        for (const ad of collectionRows(ads)) {
          const creativeId = creativeIdFromAd(ad);
          if (!creativeId) continue;
          const creative = await provider.readCreatives(target.connection, creativeId);
          await persistAdvertisingProviderObjects(db, {
            agencyId: target.agencyId,
            accountId: target.account.id,
            connectionId: target.connection.id,
            syncRunId,
            objectType: "creative",
            parentExternalObjectId: stringValue(ad.id) ?? creativeId,
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
      const response = provider.readBreakdownsComplete
        ? await provider.readBreakdownsComplete(target.connection, target.account, context, {
            cursor: cursorFor(target, `audience:${breakdown}`),
            onPage: (next) => persistSyncCursor(db, target, `audience:${breakdown}`, next),
          })
        : await provider.readBreakdowns(target.connection, target.account, context);
      const normalized = normalizeMetaBreakdownInsights(response, context);
      if (!collectionResponseComplete(response)) partial = true;
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

function creativeIdFromAd(ad: Record<string, unknown>): string | null {
  const creative = ad.creative;
  if (!isRecord(creative)) return null;
  return stringValue(creative.id);
}

function collectionResponseComplete(value: unknown): boolean {
  if (!isRecord(value)) return true;
  if (typeof value.complete === "boolean") return value.complete;
  if (!isRecord(value.paging)) return true;
  return typeof value.paging.next !== "string" && !isRecord(value.paging.next);
}

type StoredSyncCursor = { phase: string; cursor: MetaCollectionCursor };

function cursorFor(target: ClaimedSync, phase: string): MetaCollectionCursor | undefined {
  if (!target.cursor) return undefined;
  try {
    const parsed = JSON.parse(target.cursor) as Partial<StoredSyncCursor>;
    return parsed.phase === phase && parsed.cursor ? parsed.cursor : undefined;
  } catch {
    return undefined;
  }
}

async function persistSyncCursor(
  db: Db,
  target: ClaimedSync,
  phase: string,
  cursor: MetaCollectionCursor | null,
): Promise<void> {
  await db
    .update(advertisingSyncStates)
    .set({
      cursor: cursor ? JSON.stringify({ phase, cursor } satisfies StoredSyncCursor) : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(advertisingSyncStates.id, target.stateId),
        eq(advertisingSyncStates.leaseToken, target.leaseToken),
        gt(advertisingSyncStates.leaseExpiresAt, new Date()),
      ),
    );
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

export async function finishAdvertisingSync(
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
        eq(advertisingSyncStates.status, "running"),
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
        eq(advertisingSyncStates.status, "running"),
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
