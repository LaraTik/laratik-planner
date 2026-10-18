import "server-only";

import { and, asc, desc, eq, gt, gte, inArray, isNull, isNotNull, lte, max, or } from "drizzle-orm";
import type { db as appDb } from "@/lib/db";
import {
  advertisingAccounts,
  advertisingConnectionAccounts,
  advertisingConnectionAgencyAccess,
  advertisingConnections,
  advertisingFinancialAuthorities,
  advertisingGrantRevisions,
  advertisingSpendObservations,
  advertisingAudienceObservations,
  advertisingCanonicalSpendFacts,
  advertisingProviderObjects,
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

export type AdvertisingReportObject = {
  id: string;
  objectType: "campaign" | "adset" | "ad" | "creative";
  externalObjectId: string;
  parentExternalObjectId: string | null;
  name: string | null;
  status: string | null;
  objective: string | null;
  dailyBudget: string | null;
  lifetimeBudget: string | null;
  promotedPostId: string | null;
  metadata: Record<string, unknown> | null;
};

export type AdvertisingAudienceReportRow = {
  reportDate: string;
  breakdown: string;
  dimensionValue: string;
  currency: string;
  spend: string;
  impressions: number | null;
  clicks: number | null;
  reach: number | null;
};

export type AdvertisingReportQueryResult =
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | {
      kind: "ok";
      report: ScopedAdvertisingSurfaceReport;
      account: Pick<AdvertisingAccount, "id" | "name" | "currency" | "timezone">;
      objects: readonly AdvertisingReportObject[];
      audience: readonly AdvertisingAudienceReportRow[];
      lastSuccessfulSyncAt: string | null;
      syncStatus: "succeeded" | "partial" | "failed" | "dead_letter" | "running" | null;
      partial: boolean;
      freshness: "fresh" | "stale" | "unknown";
    };

export type AdvertisingReportAccount = {
  id: string;
  name: string;
  currency: string | null;
  timezone: string | null;
};

/**
 * Return only accounts that the current workspace can actually report on.
 * This is deliberately narrower than the admin resource list: account names
 * and currencies are still tenant data and must not be disclosed before an
 * active report grant is present.
 */
export async function listAdvertisingReportAccounts(
  db: Db,
  args: { actor: Actor; agencyId: string; workspaceId: string },
): Promise<AdvertisingReportAccount[]> {
  if (!(await isActiveMember(args.actor, args.agencyId))) return [];
  const [workspace] = await db
    .select({ agencyId: workspaces.agencyId })
    .from(workspaces)
    .where(and(eq(workspaces.id, args.workspaceId), eq(workspaces.agencyId, args.agencyId)))
    .limit(1);
  if (!workspace || !(await canAccessWorkspace(args.actor, args.workspaceId))) {
    return [];
  }
  const now = new Date();
  const rows = await db
    .select({
      id: advertisingAccounts.id,
      name: advertisingAccounts.name,
      currency: advertisingAccounts.currency,
      timezone: advertisingAccounts.timezone,
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
    .leftJoin(
      advertisingConnectionAgencyAccess,
      and(
        eq(advertisingConnectionAgencyAccess.connectionId, advertisingConnections.id),
        eq(advertisingConnectionAgencyAccess.agencyId, args.agencyId),
        eq(advertisingConnectionAgencyAccess.status, "active"),
      ),
    )
    .innerJoin(
      advertisingVisibilityGrants,
      and(
        eq(advertisingVisibilityGrants.accountId, advertisingAccounts.id),
        eq(advertisingVisibilityGrants.agencyId, args.agencyId),
        eq(advertisingVisibilityGrants.capability, "read_reports"),
        or(
          isNull(advertisingVisibilityGrants.workspaceId),
          eq(advertisingVisibilityGrants.workspaceId, args.workspaceId),
        ),
        lte(advertisingVisibilityGrants.startsAt, now),
        or(isNull(advertisingVisibilityGrants.endsAt), gt(advertisingVisibilityGrants.endsAt, now)),
        isNull(advertisingVisibilityGrants.revokedAt),
      ),
    )
    .where(
      and(
        eq(advertisingAccounts.agencyId, args.agencyId),
        eq(advertisingAccounts.status, "active"),
        or(
          eq(advertisingConnections.agencyId, args.agencyId),
          isNotNull(advertisingConnectionAgencyAccess.id),
        ),
      ),
    )
    .orderBy(asc(advertisingAccounts.name), asc(advertisingAccounts.id));
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

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
    .leftJoin(
      advertisingConnectionAgencyAccess,
      and(
        eq(advertisingConnectionAgencyAccess.connectionId, advertisingConnections.id),
        eq(advertisingConnectionAgencyAccess.agencyId, args.agencyId),
        eq(advertisingConnectionAgencyAccess.status, "active"),
      ),
    )
    .where(
      and(
        eq(advertisingAccounts.id, args.accountId),
        eq(advertisingAccounts.agencyId, args.agencyId),
        eq(advertisingAccounts.status, "active"),
        or(
          eq(advertisingConnections.agencyId, args.agencyId),
          isNotNull(advertisingConnectionAgencyAccess.id),
        ),
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

  const observationRows = accountRow.account.identityId
    ? await db
        .select()
        .from(advertisingCanonicalSpendFacts)
        .where(
          and(
            eq(advertisingCanonicalSpendFacts.identityId, accountRow.account.identityId),
            gte(advertisingCanonicalSpendFacts.reportDate, args.since),
            lte(advertisingCanonicalSpendFacts.reportDate, args.until),
          ),
        )
        .orderBy(
          asc(advertisingCanonicalSpendFacts.reportDate),
          asc(advertisingCanonicalSpendFacts.externalAdId),
        )
        .limit(MAX_FACT_ROWS)
    : await db
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
        accountId: args.accountId,
        campaignId: row.externalCampaignId,
        ...(row.externalAdSetId ? { adSetId: row.externalAdSetId } : {}),
        adId: row.externalAdId,
        date: row.reportDate,
        spend,
        impressions: row.impressions,
        clicks: row.clicks,
        reach: row.reach,
        results: row.results,
        ...(row.resultType ? { resultType: row.resultType } : {}),
        ...(row.resultActions &&
        typeof row.resultActions === "object" &&
        !Array.isArray(row.resultActions)
          ? { resultActions: row.resultActions as Record<string, unknown> }
          : {}),
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

  const authorizedObjectIds = [
    ...new Set(
      report.rows.flatMap((row) =>
        [row.campaignId, row.adSetId, row.adId].filter(
          (value): value is string => typeof value === "string" && value.length > 0,
        ),
      ),
    ),
  ];
  const objectRows = authorizedObjectIds.length
    ? await db
        .select({
          id: advertisingProviderObjects.id,
          objectType: advertisingProviderObjects.objectType,
          externalObjectId: advertisingProviderObjects.externalObjectId,
          parentExternalObjectId: advertisingProviderObjects.parentExternalObjectId,
          name: advertisingProviderObjects.name,
          status: advertisingProviderObjects.status,
          objective: advertisingProviderObjects.objective,
          dailyBudget: advertisingProviderObjects.dailyBudget,
          lifetimeBudget: advertisingProviderObjects.lifetimeBudget,
          promotedPostId: advertisingProviderObjects.promotedPostId,
          metadata: advertisingProviderObjects.metadata,
        })
        .from(advertisingProviderObjects)
        .where(
          and(
            eq(advertisingProviderObjects.agencyId, args.agencyId),
            eq(advertisingProviderObjects.accountId, args.accountId),
            inArray(advertisingProviderObjects.externalObjectId, authorizedObjectIds),
          ),
        )
    : [];
  const reportNow = args.now ? new Date(args.now) : new Date();
  const hasAccountWideAudienceGrant = visibilityGrants.some(
    (grant) =>
      grant.capability === "read_reports" &&
      grant.revokedAt === null &&
      new Date(grant.startsAt) <= reportNow &&
      (grant.endsAt === null || new Date(grant.endsAt) > reportNow) &&
      grant.campaignIds === null &&
      grant.adSetIds === null &&
      grant.adIds === null,
  );
  const audienceRows = hasAccountWideAudienceGrant
    ? await db
        .select({
          reportDate: advertisingAudienceObservations.reportDate,
          breakdown: advertisingAudienceObservations.breakdown,
          dimensionValue: advertisingAudienceObservations.dimensionValue,
          currency: advertisingAudienceObservations.currency,
          spend: advertisingAudienceObservations.spend,
          impressions: advertisingAudienceObservations.impressions,
          clicks: advertisingAudienceObservations.clicks,
          reach: advertisingAudienceObservations.reach,
        })
        .from(advertisingAudienceObservations)
        .where(
          and(
            eq(advertisingAudienceObservations.agencyId, args.agencyId),
            eq(advertisingAudienceObservations.accountId, args.accountId),
            gte(advertisingAudienceObservations.reportDate, args.since),
            lte(advertisingAudienceObservations.reportDate, args.until),
          ),
        )
        .orderBy(
          asc(advertisingAudienceObservations.breakdown),
          asc(advertisingAudienceObservations.reportDate),
          asc(advertisingAudienceObservations.dimensionValue),
        )
        .limit(MAX_FACT_ROWS)
    : [];

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
    objects: objectRows.flatMap((row) =>
      row.objectType === "campaign" ||
      row.objectType === "adset" ||
      row.objectType === "ad" ||
      row.objectType === "creative"
        ? [row as AdvertisingReportObject]
        : [],
    ),
    audience: audienceRows,
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
