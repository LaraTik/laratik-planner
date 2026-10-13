import type { AdvertisingAccount, AdvertisingConnection, AdvertisingReportContext } from "../types";

export const META_ADVERTISING_CAPABILITIES = {
  validate_connection: true,
  discover_accounts: true,
  read_campaigns: true,
  read_adsets: true,
  read_ads: true,
  read_creatives: true,
  read_daily_insights: true,
  read_breakdowns: true,
  write_campaigns: false,
  write_adsets: false,
  write_ads: false,
  write_creatives: false,
} as const;
export type MetaAdvertisingErrorKind =
  | "permission_denied"
  | "rate_limited"
  | "invalid_request"
  | "not_found"
  | "transient"
  | "provider_unavailable"
  | "unknown";
export interface MetaCredentialResolver {
  resolve(credentialRef: string): Promise<{ accessToken: string; appSecretProof?: string }>;
}
export interface MetaReadClient {
  get(path: string, params: Readonly<Record<string, string>>): Promise<unknown>;
}
export type MetaCollectionCursor = {
  readonly path: string;
  readonly params: Readonly<Record<string, string>>;
};
export type MetaCollectionReadOptions = {
  readonly cursor?: MetaCollectionCursor | null | undefined;
  readonly onPage?: ((next: MetaCollectionCursor | null) => Promise<void>) | undefined;
};
export type MetaCollectionResult = {
  readonly data: readonly Record<string, unknown>[];
  readonly complete: boolean;
  readonly pages: number;
};
export interface MetaAdvertisingProvider {
  readonly provider: "meta";
  validateConnection(connection: AdvertisingConnection): Promise<void>;
  discoverAccounts(connection: AdvertisingConnection): Promise<readonly AdvertisingAccount[]>;
  readCampaigns(connection: AdvertisingConnection, account: AdvertisingAccount): Promise<unknown>;
  readCampaignsComplete?: (
    connection: AdvertisingConnection,
    account: AdvertisingAccount,
    options?: MetaCollectionReadOptions,
  ) => Promise<MetaCollectionResult>;
  readAdSets(connection: AdvertisingConnection, campaignId: string): Promise<unknown>;
  readAdSetsComplete?: (
    connection: AdvertisingConnection,
    campaignId: string,
    options?: MetaCollectionReadOptions,
  ) => Promise<MetaCollectionResult>;
  readAds(connection: AdvertisingConnection, adSetId: string): Promise<unknown>;
  readAdsComplete?: (
    connection: AdvertisingConnection,
    adSetId: string,
    options?: MetaCollectionReadOptions,
  ) => Promise<MetaCollectionResult>;
  readCreatives(connection: AdvertisingConnection, adId: string): Promise<unknown>;
  readDailyInsights(
    connection: AdvertisingConnection,
    account: AdvertisingAccount,
    context: AdvertisingReportContext,
  ): Promise<unknown>;
  readDailyInsightsComplete?: (
    connection: AdvertisingConnection,
    account: AdvertisingAccount,
    context: AdvertisingReportContext,
    options?: MetaCollectionReadOptions,
  ) => Promise<MetaCollectionResult>;
  readBreakdowns(
    connection: AdvertisingConnection,
    account: AdvertisingAccount,
    context: AdvertisingReportContext,
  ): Promise<unknown>;
  readBreakdownsComplete?: (
    connection: AdvertisingConnection,
    account: AdvertisingAccount,
    context: AdvertisingReportContext,
    options?: MetaCollectionReadOptions,
  ) => Promise<MetaCollectionResult>;
  readPages(connection: AdvertisingConnection): Promise<unknown>;
  readInstagramAccounts(connection: AdvertisingConnection, pageId: string): Promise<unknown>;
}
export function classifyMetaError(status: number, code?: number): MetaAdvertisingErrorKind {
  if (status === 401 || status === 403 || code === 10 || code === 200 || code === 190)
    return "permission_denied";
  if (status === 429 || code === 17 || code === 32) return "rate_limited";
  if (status === 404) return "not_found";
  if (status >= 500) return "provider_unavailable";
  if (status >= 400) return "invalid_request";
  return "unknown";
}

export const META_DIAGNOSTIC_MAX_COLLECTION_PAGES = 3;

/** Diagnostic reads remain deliberately bounded and never follow an untrusted host. */
export async function readMetaCollection(
  client: MetaReadClient,
  path: string,
  params: Readonly<Record<string, string>>,
): Promise<MetaCollectionResult> {
  const rows: Record<string, unknown>[] = [];
  let currentPath = path;
  let currentParams: Readonly<Record<string, string>> = params;
  let response = await client.get(path, params);
  let pages = 0;
  let complete = true;
  for (let page = 0; page < META_DIAGNOSTIC_MAX_COLLECTION_PAGES; page += 1) {
    pages += 1;
    rows.push(...collectionData(response));
    const next = nextPage(response, currentPath, currentParams);
    if (!next) break;
    if (page === META_DIAGNOSTIC_MAX_COLLECTION_PAGES - 1) {
      complete = false;
      break;
    }
    response = await client.get(next.path, next.params);
    currentPath = next.path;
    currentParams = next.params;
  }
  return { data: rows, complete, pages };
}

/** Production reads follow every validated page and can resume from a cursor. */
export async function readMetaCollectionComplete(
  client: MetaReadClient,
  path: string,
  params: Readonly<Record<string, string>>,
  options: MetaCollectionReadOptions = {},
): Promise<MetaCollectionResult> {
  const rows: Record<string, unknown>[] = [];
  let currentPath = options.cursor?.path ?? path;
  let currentParams: Readonly<Record<string, string>> = options.cursor?.params ?? params;
  const seen = new Set<string>();
  let pages = 0;
  while (pages < 10_000) {
    const requestKey = `${currentPath}?${new URLSearchParams(currentParams).toString()}`;
    if (seen.has(requestKey)) return { data: rows, complete: false, pages };
    seen.add(requestKey);
    const response = await client.get(currentPath, currentParams);
    pages += 1;
    rows.push(...collectionData(response));
    const next = nextPage(response, currentPath, currentParams);
    await options.onPage?.(next);
    if (!next) return { data: rows, complete: true, pages };
    currentPath = next.path;
    currentParams = next.params;
  }
  return { data: rows, complete: false, pages };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function collectionData(value: unknown): readonly Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (isRecord(value) && Array.isArray(value.data)) return value.data.filter(isRecord);
  return [];
}

function nextPage(
  value: unknown,
  currentPath: string,
  currentParams: Readonly<Record<string, string>>,
): MetaCollectionCursor | null {
  if (!isRecord(value) || !isRecord(value.paging)) return null;
  const next = value.paging.next;
  if (isRecord(next) && typeof next.after === "string" && next.after.length > 0)
    return { path: currentPath, params: { ...currentParams, after: next.after } };
  if (typeof next !== "string") return null;
  let url: URL;
  try {
    url = new URL(next);
  } catch {
    return null;
  }
  if (url.hostname !== "graph.facebook.com") return null;
  const match = url.pathname.match(/^\/v\d+\.\d+\/(.+)$/);
  if (!match?.[1]) return null;
  const nextParams: Record<string, string> = {};
  url.searchParams.forEach((entry, key) => {
    if (key !== "access_token" && key !== "appsecret_proof") nextParams[key] = entry;
  });
  return { path: match[1], params: nextParams };
}

/** Read-only adapter. Secrets are resolved by reference at execution time and never enter a job payload. */
export function createMetaAdvertisingProvider(
  resolver: MetaCredentialResolver,
  clientFactory: (credential: { accessToken: string; appSecretProof?: string }) => MetaReadClient,
): MetaAdvertisingProvider {
  const clientFor = async (connection: AdvertisingConnection) =>
    clientFactory(await resolver.resolve(connection.credentialRef));
  return {
    provider: "meta",
    async validateConnection(connection) {
      await (await clientFor(connection)).get("me", {});
    },
    async discoverAccounts(connection) {
      const response = await readMetaCollection(await clientFor(connection), "me/adaccounts", {
        fields: "id,name,currency,timezone_name",
      });
      return collectionData(response).flatMap((account) => {
        if (typeof account.id !== "string" || typeof account.name !== "string") return [];
        return [
          {
            id: account.id,
            provider: "meta" as const,
            externalAccountId: account.id,
            agencyId: connection.agencyId,
            name: account.name,
            currency: typeof account.currency === "string" ? account.currency : "",
            timezone: typeof account.timezone_name === "string" ? account.timezone_name : "",
            connectionId: connection.id,
            status: connection.status,
          } satisfies AdvertisingAccount,
        ];
      });
    },
    async readCampaigns(connection, account) {
      return readMetaCollection(
        await clientFor(connection),
        `${account.externalAccountId}/campaigns`,
        {
          fields: "id,name,status,objective,daily_budget,lifetime_budget",
        },
      );
    },
    async readCampaignsComplete(connection, account, options) {
      return readMetaCollectionComplete(
        await clientFor(connection),
        `${account.externalAccountId}/campaigns`,
        { fields: "id,name,status,objective,daily_budget,lifetime_budget" },
        options,
      );
    },
    async readAdSets(connection, campaignId) {
      return readMetaCollection(await clientFor(connection), `${campaignId}/adsets`, {
        fields: "id,name,status,campaign_id,daily_budget,lifetime_budget,targeting",
      });
    },
    async readAdSetsComplete(connection, campaignId, options) {
      return readMetaCollectionComplete(
        await clientFor(connection),
        `${campaignId}/adsets`,
        { fields: "id,name,status,campaign_id,daily_budget,lifetime_budget,targeting" },
        options,
      );
    },
    async readAds(connection, adSetId) {
      return readMetaCollection(await clientFor(connection), `${adSetId}/ads`, {
        fields: "id,name,status,adset_id,creative",
      });
    },
    async readAdsComplete(connection, adSetId, options) {
      return readMetaCollectionComplete(
        await clientFor(connection),
        `${adSetId}/ads`,
        { fields: "id,name,status,adset_id,creative" },
        options,
      );
    },
    async readCreatives(connection, adId) {
      return (await clientFor(connection)).get(`${adId}/creative`, {
        fields: "id,name,object_story_spec",
      });
    },
    async readDailyInsights(connection, account, context) {
      return readMetaCollection(
        await clientFor(connection),
        `${account.externalAccountId}/insights`,
        {
          fields:
            "ad_id,adset_id,campaign_id,date_start,spend,impressions,clicks,reach,actions,ctr,cpc,cpm",
          time_range: JSON.stringify(context.dateRange),
          time_increment: "1",
          level:
            context.grain === "ad_day"
              ? "ad"
              : context.grain === "adset_day"
                ? "adset"
                : context.grain === "campaign_day"
                  ? "campaign"
                  : "account",
          ...(context.breakdowns.length ? { breakdowns: context.breakdowns.join(",") } : {}),
        },
      );
    },
    async readDailyInsightsComplete(connection, account, context, options) {
      return readMetaCollectionComplete(
        await clientFor(connection),
        `${account.externalAccountId}/insights`,
        {
          fields:
            "ad_id,adset_id,campaign_id,date_start,spend,impressions,clicks,reach,actions,ctr,cpc,cpm",
          time_range: JSON.stringify(context.dateRange),
          time_increment: "1",
          level:
            context.grain === "ad_day"
              ? "ad"
              : context.grain === "adset_day"
                ? "adset"
                : context.grain === "campaign_day"
                  ? "campaign"
                  : "account",
          ...(context.breakdowns.length ? { breakdowns: context.breakdowns.join(",") } : {}),
        },
        options,
      );
    },
    async readBreakdowns(connection, account, context) {
      return this.readDailyInsights(connection, account, context);
    },
    async readBreakdownsComplete(connection, account, context, options) {
      return (
        this.readDailyInsightsComplete?.(connection, account, context, options) ?? {
          data: [],
          complete: false,
          pages: 0,
        }
      );
    },
    async readPages(connection) {
      return readMetaCollection(await clientFor(connection), "me/accounts", {
        fields: "id,name,instagram_business_account",
      });
    },
    async readInstagramAccounts(connection, pageId) {
      return (await clientFor(connection)).get(pageId, {
        fields: "instagram_business_account",
      });
    },
  };
}
