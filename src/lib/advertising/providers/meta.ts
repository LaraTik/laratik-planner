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
export interface MetaAdvertisingProvider {
  readonly provider: "meta";
  validateConnection(connection: AdvertisingConnection): Promise<void>;
  discoverAccounts(connection: AdvertisingConnection): Promise<readonly AdvertisingAccount[]>;
  readCampaigns(connection: AdvertisingConnection, account: AdvertisingAccount): Promise<unknown>;
  readAdSets(connection: AdvertisingConnection, campaignId: string): Promise<unknown>;
  readAds(connection: AdvertisingConnection, adSetId: string): Promise<unknown>;
  readCreatives(connection: AdvertisingConnection, adId: string): Promise<unknown>;
  readDailyInsights(
    connection: AdvertisingConnection,
    account: AdvertisingAccount,
    context: AdvertisingReportContext,
  ): Promise<unknown>;
  readBreakdowns(
    connection: AdvertisingConnection,
    account: AdvertisingAccount,
    context: AdvertisingReportContext,
  ): Promise<unknown>;
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
/** Read-only adapter. Secrets are resolved by reference at execution time and never enter a job payload. */
export function createMetaAdvertisingProvider(
  resolver: MetaCredentialResolver,
  clientFactory: (credential: { accessToken: string; appSecretProof?: string }) => MetaReadClient,
): MetaAdvertisingProvider {
  const clientFor = async (connection: AdvertisingConnection) =>
    clientFactory(await resolver.resolve(connection.credentialRef));
  const collectionData = (value: unknown): readonly Record<string, unknown>[] => {
    if (Array.isArray(value)) return value.filter(isRecord);
    if (isRecord(value) && Array.isArray(value.data)) return value.data.filter(isRecord);
    return [];
  };
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value && typeof value === "object" && !Array.isArray(value));
  return {
    provider: "meta",
    async validateConnection(connection) {
      await (await clientFor(connection)).get("me", {});
    },
    async discoverAccounts(connection) {
      const response = await (
        await clientFor(connection)
      ).get("me/adaccounts", {
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
      return (await clientFor(connection)).get(`${account.externalAccountId}/campaigns`, {
        fields: "id,name,status,objective",
      });
    },
    async readAdSets(connection, campaignId) {
      return (await clientFor(connection)).get(`${campaignId}/adsets`, {
        fields: "id,name,status,campaign_id",
      });
    },
    async readAds(connection, adSetId) {
      return (await clientFor(connection)).get(`${adSetId}/ads`, {
        fields: "id,name,status,adset_id,creative",
      });
    },
    async readCreatives(connection, adId) {
      return (await clientFor(connection)).get(`${adId}/creative`, {
        fields: "id,name,object_story_spec",
      });
    },
    async readDailyInsights(connection, account, context) {
      return (await clientFor(connection)).get(`${account.externalAccountId}/insights`, {
        fields: "spend,impressions,clicks,reach,actions,ctr,cpc,cpm",
        time_range: JSON.stringify(context.dateRange),
        time_increment: "1",
        ...(context.breakdowns.length ? { breakdowns: context.breakdowns.join(",") } : {}),
      });
    },
    async readBreakdowns(connection, account, context) {
      return this.readDailyInsights(connection, account, context);
    },
    async readPages(connection) {
      return (await clientFor(connection)).get("me/accounts", {
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
