import { authorizeAdvertising } from "./authorization";
import type {
  AdvertisingAccount,
  AdvertisingAuthorizationInput,
  AdvertisingConnection,
  AdvertisingFinancialAuthority,
  AdvertisingPrincipal,
  AdvertisingVisibilityGrant,
} from "./types";

export type AdvertisingFact = {
  readonly accountId: string;
  readonly campaignId: string;
  readonly adSetId?: string | undefined;
  readonly adId?: string | undefined;
  readonly date: string;
  readonly spend: number;
  readonly impressions: number;
  readonly clicks: number;
  readonly reach?: number | null | undefined;
  readonly results?: number | null | undefined;
  readonly resultType?: string | null | undefined;
  readonly resultActions?: Record<string, unknown> | null | undefined;
};

export type ScopedAdvertisingReport = {
  readonly authorized: boolean;
  readonly reason: string;
  readonly rows: readonly AdvertisingFact[];
  readonly totals: {
    readonly spend: number;
    readonly impressions: number;
    readonly clicks: number;
    readonly results: number | null;
    readonly ctr: number | null;
    readonly cpc: number | null;
    readonly cpm: number | null;
  };
};

export type AdvertisingReportingScope = {
  readonly principal: AdvertisingPrincipal | null;
  readonly account: AdvertisingAccount | null;
  readonly connection: AdvertisingConnection | null;
  readonly visibilityGrants: readonly AdvertisingVisibilityGrant[];
  readonly financialAuthorities: readonly AdvertisingFinancialAuthority[];
};

function totals(rows: readonly AdvertisingFact[]) {
  const spend = rows.reduce((sum, row) => sum + row.spend, 0);
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const resultRows = rows.filter((row) => row.results !== null && row.results !== undefined);
  return {
    spend,
    impressions,
    clicks,
    results:
      resultRows.length === rows.length && rows.length > 0
        ? resultRows.reduce((sum, row) => sum + (row.results ?? 0), 0)
        : null,
    ctr: impressions > 0 ? clicks / impressions : null,
    cpc: clicks > 0 ? spend / clicks : null,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
  };
}

/**
 * The one projection seam for dashboards, exports, background reports, and AI.
 * Every fact is authorized before it participates in totals, counts, or
 * derived non-additive metrics. A denied scope returns no facts or metadata
 * that could reveal the hidden account.
 */
export function buildScopedAdvertisingReport(
  scope: AdvertisingReportingScope,
  facts: readonly AdvertisingFact[],
  options: {
    operation?: "report_read" | "financial_read" | "export" | "ai_context";
    now?: string;
  } = {},
): ScopedAdvertisingReport {
  const operation = options.operation ?? "report_read";
  const authScope = {
    principal: scope.principal,
    account: scope.account,
    connection: scope.connection,
    visibilityGrants: scope.visibilityGrants,
    financialAuthorities: scope.financialAuthorities,
    operation,
    ...(options.now ? { now: options.now } : {}),
  } satisfies AdvertisingAuthorizationInput;
  const decision = authorizeAdvertising(authScope);
  if (!decision.allowed) {
    return { authorized: false, reason: decision.reason, rows: [], totals: totals([]) };
  }

  const rows = facts.filter((fact) => {
    if (fact.accountId !== scope.account?.id) return false;
    return authorizeAdvertising({
      principal: scope.principal,
      account: scope.account,
      connection: scope.connection,
      visibilityGrants: scope.visibilityGrants,
      financialAuthorities: scope.financialAuthorities,
      operation,
      resource: {
        campaignId: fact.campaignId,
        ...(fact.adSetId ? { adSetId: fact.adSetId } : {}),
        ...(fact.adId ? { adId: fact.adId } : {}),
      },
      ...(options.now ? { now: options.now } : {}),
    }).allowed;
  });
  return { authorized: true, reason: "allowed", rows, totals: totals(rows) };
}

export function advertisingReportCacheKey(args: {
  agencyId: string;
  workspaceId: string;
  accountId: string;
  since: string;
  until: string;
  grantRevision: string | number;
}): string {
  return [
    args.agencyId,
    args.workspaceId,
    args.accountId,
    args.since,
    args.until,
    args.grantRevision,
  ].join(":");
}
