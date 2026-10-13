import "server-only";

import { and, asc, desc, eq, gte, inArray, isNull, lte, max, or } from "drizzle-orm";
import type { db as appDb } from "@/lib/db";
import {
  advertisingAccounts,
  advertisingConnectionAccounts,
  advertisingConnections,
  advertisingFinancialAuthorities,
  advertisingGrantRevisions,
  advertisingSpendObservations,
  advertisingSyncRuns,
  advertisingSyncStates,
  advertisingVisibilityGrants,
  workspaces,
} from "@/lib/db/schema";
import { canAccessWorkspace, type Actor } from "@/lib/auth/policy";
import { isActiveMember } from "@/lib/auth/agency-context";
import {
  buildAdvertisingSurfaceReport,
  type AdvertisingReportSurface,
  type ScopedAdvertisingSurfaceReport,
} from "./reporting-boundary";
import type {
  AdvertisingAccount,
  AdvertisingConnection,
  AdvertisingFinancialAuthority,
  AdvertisingPrincipal,
  AdvertisingVisibilityGrant,
} from "./types";

type Db = typeof appDb;

const MAX_FACT_ROWS = 10_000;
const VALID_CAPABILITIES = new Set<AdvertisingPrincipal["capabilities"][number]>([
  "discover_accounts",
  "read_campaigns",
  "read_adsets",
  "read_ads",
  "read_creatives",
  "read_reports",
  "read_financials",
  "manage_visibility_grants",
  "run_diagnostics",
  "use_ai_context",
  "export_reports",
]);

export type AdvertisingReportQuery = {
  actor: Actor;
  agencyId: string;
  workspaceId: string | null;
  accountId: string;
  since: string;
  until: string;
  surface: AdvertisingReportSurface;
  now?: string | undefined;
};

export type AdvertisingReportQueryResult =
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | {
      kind: "ok";
      report: ScopedAdvertisingSurfaceReport;
      account: Pick<AdvertisingAccount, "id" | "name" | "currency" | "timezone">;
      lastSuccessfulSyncAt: string | null;
      syncStatus: "succeeded" | "partial" | "failed" | "dead_letter" | "running" | null;
      partial: boolean;
      freshness: "fresh" | "stale" | "unknown";
    };

/**
 * Load canonical persisted facts and resolve the complete authorization scope
 * before the reporting boundary aggregates anything. This is intentionally a
 * server-only seam: route handlers, exports, background reports, and AI
 * callers must not assemble their own tenant filters.
 */
export async function loadAdvertisingReport(
  db: Db,
  args: AdvertisingReportQuery,
): Promise<AdvertisingReportQueryResult> {
  if (!(await isActiveMember(args.actor, args.agencyId))) return { kind: "forbidden" };
  if (args.workspaceId) {
    const [workspace] = await db
      .select({ agencyId: workspaces.agencyId })
      .from(workspaces)
      .where(and(eq(workspaces.id, args.workspaceId), eq(workspaces.agencyId, args.agencyId)))
      .limit(1);
    if (!workspace || !(await canAccessWorkspace(args.actor, args.workspaceId))) {
      return { kind: "forbidden" };
    }
  }

  const accountRows = await db
    .select({
      account: advertisingAccounts,
      connection: advertisingConnections,
    })
    .from(advertisingAccounts)
    .innerJoin(
      advertisingConnectionAccounts,
      and(
        eq(advertisingConnectionAccounts.accountId, advertisingAccounts.id),
        eq(advertisingConnectionAccounts.status, "active"),
      ),
    )
    .innerJoin(
      advertisingConnections,
      and(
        eq(advertisingConnections.id, advertisingConnectionAccounts.connectionId),
        eq(advertisingConnections.status, "active"),
      ),
    )
    .where(
      and(
        eq(advertisingAccounts.id, args.accountId),
        eq(advertisingAccounts.agencyId, args.agencyId),
        eq(advertisingAccounts.status, "active"),
        eq(advertisingConnections.agencyId, args.agencyId),
      ),
    )
    .orderBy(desc(advertisingConnections.updatedAt), asc(advertisingConnections.id))
    .limit(1);
  const accountRow = accountRows[0];
  if (!accountRow) return { kind: "not_found" };

  const account: AdvertisingAccount = {
    id: accountRow.account.id,
    provider: "meta",
    externalAccountId: accountRow.account.externalAccountId,
    agencyId: accountRow.account.agencyId,
    name: accountRow.account.name,
    currency: accountRow.account.currency ?? "",
    timezone: accountRow.account.timezone ?? "",
    connectionId: accountRow.connection.id,
    status: "active",
  };
  const connection: AdvertisingConnection = {
    id: accountRow.connection.id,
    provider: "meta",
    agencyId: accountRow.connection.agencyId,
    credentialRef: accountRow.connection.credentialRef,
    status: "active",
    lastValidatedAt: accountRow.connection.lastValidatedAt?.toISOString() ?? null,
  };

  const scopeFilter = args.workspaceId
    ? or(
        isNull(advertisingVisibilityGrants.workspaceId),
        eq(advertisingVisibilityGrants.workspaceId, args.workspaceId),
      )
    : isNull(advertisingVisibilityGrants.workspaceId);
  const grantRows = await db
    .select()
    .from(advertisingVisibilityGrants)
    .where(
      and(
        eq(advertisingVisibilityGrants.agencyId, args.agencyId),
        eq(advertisingVisibilityGrants.accountId, args.accountId),
        scopeFilter,
      ),
    )
    .limit(500);
  const grantIds = grantRows.map((grant) => grant.id);
  const revisionRows = grantIds.length
    ? await db
        .select({
          grantId: advertisingGrantRevisions.grantId,
          revision: max(advertisingGrantRevisions.revision),
        })
        .from(advertisingGrantRevisions)
        .where(inArray(advertisingGrantRevisions.grantId, grantIds))
        .groupBy(advertisingGrantRevisions.grantId)
    : [];
  const revisionByGrantId = new Map(revisionRows.map((row) => [row.grantId, row.revision ?? 0]));
  const grantRevision = grantRows
    .map((grant) => `${grant.id}:${revisionByGrantId.get(grant.id) ?? 0}`)
    .sort()
    .join(",");
  const visibilityGrants = grantRows.map(toVisibilityGrant);
  const financialRows = await db
    .select()
    .from(advertisingFinancialAuthorities)
    .where(
      and(
        eq(advertisingFinancialAuthorities.agencyId, args.agencyId),
        eq(advertisingFinancialAuthorities.accountId, args.accountId),
        args.workspaceId
          ? or(
              isNull(advertisingFinancialAuthorities.workspaceId),
              eq(advertisingFinancialAuthorities.workspaceId, args.workspaceId),
            )
          : isNull(advertisingFinancialAuthorities.workspaceId),
      ),
    )
    .limit(500);
  const financialAuthorities = financialRows.map(toFinancialAuthority);
  const capabilities = [
    ...new Set(
      grantRows.flatMap((grant) =>
        VALID_CAPABILITIES.has(grant.capability as AdvertisingPrincipal["capabilities"][number])
          ? [grant.capability as AdvertisingPrincipal["capabilities"][number]]
          : [],
      ),
    ),
  ];
  const principal: AdvertisingPrincipal = {
    userId: args.actor.id,
    agencyId: args.agencyId,
    workspaceId: args.workspaceId,
    capabilities,
    supportAccessAgencyId: null,
  };

  const observationRows = await db
    .select()
    .from(advertisingSpendObservations)
    .where(
      and(
        eq(advertisingSpendObservations.agencyId, args.agencyId),
        eq(advertisingSpendObservations.accountId, args.accountId),
        gte(advertisingSpendObservations.reportDate, args.since),
        lte(advertisingSpendObservations.reportDate, args.until),
      ),
    )
    .orderBy(
      asc(advertisingSpendObservations.reportDate),
      asc(advertisingSpendObservations.externalAdId),
    )
    .limit(MAX_FACT_ROWS);
  const facts = observationRows.flatMap((row) => {
    const spend = finiteNonnegativeNumber(row.spend);
    if (!row.externalCampaignId || spend === null) return [];
    return [
      {
        accountId: row.accountId,
        campaignId: row.externalCampaignId,
        ...(row.externalAdSetId ? { adSetId: row.externalAdSetId } : {}),
        adId: row.externalAdId,
        date: row.reportDate,
        spend,
        impressions: row.impressions,
        clicks: row.clicks,
      },
    ];
  });
  const partial =
    observationRows.length >= MAX_FACT_ROWS || facts.length !== observationRows.length;
  const report = buildAdvertisingSurfaceReport({
    surface: args.surface,
    scope: {
      principal,
      account,
      connection,
      visibilityGrants,
      financialAuthorities,
    },
    facts,
    cache: {
      agencyId: args.agencyId,
      workspaceId: args.workspaceId ?? "agency",
      since: args.since,
      until: args.until,
      grantRevision,
    },
    ...(args.now ? { now: args.now } : {}),
  });
  // A denied report is a denied resource. Do not return account metadata,
  // sync freshness, or an empty projection that could confirm the account's
  // existence to a caller without an applicable grant.
  if (!report.authorized) return { kind: "forbidden" };

  const syncRows = await db
    .select({
      status: advertisingSyncRuns.status,
      syncStateStatus: advertisingSyncStates.status,
      partial: advertisingSyncRuns.partial,
      completedAt: advertisingSyncRuns.completedAt,
    })
    .from(advertisingSyncRuns)
    .innerJoin(advertisingSyncStates, eq(advertisingSyncStates.id, advertisingSyncRuns.syncStateId))
    .where(
      and(
        eq(advertisingSyncRuns.connectionId, accountRow.connection.id),
        eq(advertisingSyncRuns.accountId, accountRow.account.id),
      ),
    )
    .orderBy(desc(advertisingSyncRuns.startedAt))
    .limit(20);
  const latestSync = syncRows[0];
  const lastSuccessfulSyncAt =
    syncRows.find((row) => row.status === "succeeded")?.completedAt?.toISOString() ?? null;
  const latestStatus =
    latestSync?.syncStateStatus === "dead_letter" ? "dead_letter" : latestSync?.status;
  const syncStatus =
    latestStatus === "succeeded" ||
    latestStatus === "partial" ||
    latestStatus === "failed" ||
    latestStatus === "dead_letter" ||
    latestStatus === "running"
      ? latestStatus
      : null;
  const clockMs = args.now ? Date.parse(args.now) : Date.now();
  const freshness = lastSuccessfulSyncAt
    ? clockMs - Date.parse(lastSuccessfulSyncAt) <= 24 * 60 * 60 * 1000
      ? "fresh"
      : "stale"
    : "unknown";
  return {
    kind: "ok",
    report,
    account: {
      id: account.id,
      name: account.name,
      currency: account.currency,
      timezone: account.timezone,
    },
    lastSuccessfulSyncAt,
    syncStatus,
    partial: partial || latestSync?.partial === true,
    freshness,
  };
}

function finiteNonnegativeNumber(value: unknown): number | null {
  const number =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function toVisibilityGrant(
  row: typeof advertisingVisibilityGrants.$inferSelect,
): AdvertisingVisibilityGrant {
  return {
    id: row.id,
    agencyId: row.agencyId,
    workspaceId: row.workspaceId,
    accountId: row.accountId,
    campaignIds: row.campaignIds,
    adSetIds: row.adSetIds,
    adIds: row.adIds,
    capability: row.capability as AdvertisingVisibilityGrant["capability"],
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

function toFinancialAuthority(
  row: typeof advertisingFinancialAuthorities.$inferSelect,
): AdvertisingFinancialAuthority {
  return {
    id: row.id,
    agencyId: row.agencyId,
    workspaceId: row.workspaceId,
    accountId: row.accountId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}
