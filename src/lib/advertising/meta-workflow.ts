import type { db as appDb } from "@/lib/db";
import {
  activateAdvertisingConnection,
  persistDiscoveredAdvertisingAccount,
  persistDiscoveredAdvertisingSocialIdentity,
  recordAdvertisingValidation,
  setAdvertisingCapability,
} from "./connection-service";
import { classifyMetaError, type MetaAdvertisingProvider } from "./providers/meta";
import type { AdvertisingAccount, AdvertisingConnection } from "./types";

type Db = typeof appDb;

export type MetaDiagnosticState =
  | "valid"
  | "missing_permission"
  | "missing_asset_assignment"
  | "expired_or_revoked"
  | "wrong_app_or_account"
  | "access_tier_restricted"
  | "unsupported_field"
  | "rate_limited"
  | "provider_temporarily_unavailable"
  | "no_data";

export type MetaDiagnostic = {
  readonly operation: string;
  readonly state: MetaDiagnosticState;
  readonly retryable: boolean;
};

function providerFailure(error: unknown): {
  state: MetaDiagnosticState;
  retryable: boolean;
  code: string;
} {
  const candidate = error as { status?: unknown; code?: unknown };
  const status = typeof candidate.status === "number" ? candidate.status : 500;
  const code = typeof candidate.code === "number" ? candidate.code : undefined;
  const kind = classifyMetaError(status, code);
  switch (kind) {
    case "permission_denied":
      return {
        state: code === 190 ? "expired_or_revoked" : "missing_permission",
        retryable: false,
        code: "meta_permission_denied",
      };
    case "rate_limited":
      return { state: "rate_limited", retryable: true, code: "meta_rate_limited" };
    case "not_found":
      return { state: "missing_asset_assignment", retryable: false, code: "meta_asset_not_found" };
    case "invalid_request":
      return { state: "unsupported_field", retryable: false, code: "meta_invalid_request" };
    case "provider_unavailable":
    case "transient":
      return {
        state: "provider_temporarily_unavailable",
        retryable: true,
        code: "meta_provider_unavailable",
      };
    default:
      return { state: "wrong_app_or_account", retryable: false, code: "meta_validation_failed" };
  }
}

async function recordFailure(
  db: Db,
  connectionId: string,
  operation:
    | "diagnostics"
    | "account_discovery"
    | "campaign_read"
    | "adset_read"
    | "ad_read"
    | "creative_read"
    | "daily_insights_read"
    | "breakdown_read"
    | "page_read"
    | "instagram_read",
  error: unknown,
  accountId?: string,
): Promise<MetaDiagnostic & { validationResultId: string }> {
  const failure = providerFailure(error);
  const validation = await recordAdvertisingValidation(db, {
    connectionId,
    ...(accountId ? { accountId } : {}),
    operation,
    status: failure.retryable ? "unavailable" : "failed",
    sanitizedCode: failure.code,
    retryable: failure.retryable,
    metadata: { state: failure.state },
  });
  return {
    operation,
    state: failure.state,
    retryable: failure.retryable,
    validationResultId: validation.id,
  };
}

/**
 * Run the first bounded, read-only Meta configuration workflow. It activates a
 * connection only after identity validation, persists sanitized discoveries,
 * and records capability outcomes without retaining provider payloads.
 */
export async function runMetaConfigurationWorkflow(
  db: Db,
  args: {
    agencyId: string;
    connection: AdvertisingConnection;
    provider: MetaAdvertisingProvider;
  },
) {
  const diagnostics: MetaDiagnostic[] = [];
  try {
    await args.provider.validateConnection(args.connection);
    await recordAdvertisingValidation(db, {
      connectionId: args.connection.id,
      operation: "diagnostics",
      status: "passed",
      sanitizedCode: "meta_identity_valid",
      metadata: { state: "valid" },
    });
    diagnostics.push({ operation: "diagnostics", state: "valid", retryable: false });
    await activateAdvertisingConnection(db, {
      agencyId: args.agencyId,
      connectionId: args.connection.id,
    });
  } catch (error) {
    const failure = await recordFailure(db, args.connection.id, "diagnostics", error);
    diagnostics.push({
      operation: failure.operation,
      state: failure.state,
      retryable: failure.retryable,
    });
    return { status: "failed" as const, diagnostics, accounts: [] as const };
  }

  let discovered: readonly AdvertisingAccount[];
  try {
    discovered = await args.provider.discoverAccounts(args.connection);
  } catch (error) {
    const failure = await recordFailure(db, args.connection.id, "account_discovery", error);
    diagnostics.push({
      operation: failure.operation,
      state: failure.state,
      retryable: failure.retryable,
    });
    return { status: "partial" as const, diagnostics, accounts: [] as const };
  }

  let pageProbe: unknown = null;
  let pageProbePassed = false;
  try {
    pageProbe = await args.provider.readPages(args.connection);
    pageProbePassed = true;
    for (const identity of extractMetaSocialIdentities(pageProbe)) {
      await persistDiscoveredAdvertisingSocialIdentity(db, {
        agencyId: args.agencyId,
        connectionId: args.connection.id,
        identityType: identity.identityType,
        externalIdentityId: identity.externalIdentityId,
        displayName: identity.displayName,
        username: identity.username,
        parentExternalIdentityId: identity.parentExternalIdentityId,
        metadata: { source: "meta_read_only_probe" },
      });
    }
    await recordAdvertisingValidation(db, {
      connectionId: args.connection.id,
      operation: "page_read",
      status: "passed",
      sanitizedCode: "meta_page_read_available",
      metadata: { state: "valid" },
    });
    diagnostics.push({ operation: "page_read", state: "valid", retryable: false });
  } catch (error) {
    const failure = await recordFailure(db, args.connection.id, "page_read", error);
    diagnostics.push({
      operation: failure.operation,
      state: failure.state,
      retryable: failure.retryable,
    });
  }

  const accounts: Array<{ id: string; externalAccountId: string }> = [];
  for (const account of discovered.slice(0, 50)) {
    const persisted = await persistDiscoveredAdvertisingAccount(db, {
      agencyId: args.agencyId,
      connectionId: args.connection.id,
      externalAccountId: account.externalAccountId,
      name: account.name,
      currency: account.currency,
      timezone: account.timezone,
      metadata: { provider: account.provider, status: account.status },
    });
    accounts.push({ id: persisted.id, externalAccountId: persisted.externalAccountId });
    const accountView = { ...account, id: persisted.id };
    let operation:
      | "campaign_read"
      | "adset_read"
      | "ad_read"
      | "creative_read"
      | "daily_insights_read"
      | "breakdown_read" = "campaign_read";
    try {
      const campaigns = await args.provider.readCampaigns(args.connection, accountView);
      const validation = await recordAdvertisingValidation(db, {
        connectionId: args.connection.id,
        accountId: persisted.id,
        operation: "campaign_read",
        status: "passed",
        sanitizedCode: "meta_campaign_read_available",
        metadata: { state: "valid" },
      });
      await setAdvertisingCapability(db, {
        connectionId: args.connection.id,
        accountId: persisted.id,
        capability: "read_campaigns",
        status: "available",
        validationResultId: validation.id,
      });
      diagnostics.push({ operation: "campaign_read", state: "valid", retryable: false });

      const campaignId = firstCollectionId(campaigns);
      if (campaignId) {
        operation = "adset_read";
        const adSets = await args.provider.readAdSets(args.connection, campaignId);
        const adsetValidation = await recordAdvertisingValidation(db, {
          connectionId: args.connection.id,
          accountId: persisted.id,
          operation: "adset_read",
          status: "passed",
          sanitizedCode: "meta_adset_read_available",
          metadata: { state: "valid" },
        });
        await setAdvertisingCapability(db, {
          connectionId: args.connection.id,
          accountId: persisted.id,
          capability: "read_adsets",
          status: "available",
          validationResultId: adsetValidation.id,
        });
        diagnostics.push({ operation: "adset_read", state: "valid", retryable: false });
        const adSetId = firstCollectionId(adSets);
        if (adSetId) {
          operation = "ad_read";
          const ads = await args.provider.readAds(args.connection, adSetId);
          const adValidation = await recordAdvertisingValidation(db, {
            connectionId: args.connection.id,
            accountId: persisted.id,
            operation: "ad_read",
            status: "passed",
            sanitizedCode: "meta_ad_read_available",
            metadata: { state: "valid" },
          });
          await setAdvertisingCapability(db, {
            connectionId: args.connection.id,
            accountId: persisted.id,
            capability: "read_ads",
            status: "available",
            validationResultId: adValidation.id,
          });
          diagnostics.push({ operation: "ad_read", state: "valid", retryable: false });
          const adId = firstCollectionId(ads);
          if (adId) {
            operation = "creative_read";
            await args.provider.readCreatives(args.connection, adId);
            const creativeValidation = await recordAdvertisingValidation(db, {
              connectionId: args.connection.id,
              accountId: persisted.id,
              operation: "creative_read",
              status: "passed",
              sanitizedCode: "meta_creative_read_available",
              metadata: { state: "valid" },
            });
            await setAdvertisingCapability(db, {
              connectionId: args.connection.id,
              accountId: persisted.id,
              capability: "read_creatives",
              status: "available",
              validationResultId: creativeValidation.id,
            });
            diagnostics.push({ operation: "creative_read", state: "valid", retryable: false });
          }
        }
      }

      const context = {
        definitionVersion: "meta-read-v1",
        provider: "meta" as const,
        accountId: account.externalAccountId,
        currency: account.currency,
        timezone: account.timezone,
        dateRange: recentDateRange(),
        attributionWindow: null,
        actionReportTime: "impression",
        breakdowns: [],
        grain: "account_day" as const,
      };
      operation = "daily_insights_read";
      await args.provider.readDailyInsights(args.connection, accountView, context);
      const insightsValidation = await recordAdvertisingValidation(db, {
        connectionId: args.connection.id,
        accountId: persisted.id,
        operation: "daily_insights_read",
        status: "passed",
        sanitizedCode: "meta_daily_insights_available",
        metadata: { state: "valid" },
      });
      await setAdvertisingCapability(db, {
        connectionId: args.connection.id,
        accountId: persisted.id,
        capability: "read_reports",
        status: "available",
        validationResultId: insightsValidation.id,
      });
      diagnostics.push({ operation: "daily_insights_read", state: "valid", retryable: false });
      operation = "breakdown_read";
      // Probe one explicitly bounded, supported audience-breakdown request;
      // the canonical spend ingestion path remains breakdown-free.
      await args.provider.readBreakdowns(args.connection, accountView, {
        ...context,
        breakdowns: ["age", "gender"],
      });
      await recordAdvertisingValidation(db, {
        connectionId: args.connection.id,
        accountId: persisted.id,
        operation: "breakdown_read",
        status: "passed",
        sanitizedCode: "meta_breakdown_read_available",
        metadata: { state: "valid" },
      });
      diagnostics.push({ operation: "breakdown_read", state: "valid", retryable: false });
    } catch (error) {
      const failure = await recordFailure(db, args.connection.id, operation, error, persisted.id);
      const capability = capabilityForOperation(operation);
      if (capability) {
        await setAdvertisingCapability(db, {
          connectionId: args.connection.id,
          accountId: persisted.id,
          capability,
          status: failure.retryable ? "unknown" : "unavailable",
          validationResultId: failure.validationResultId,
        });
      }
      diagnostics.push({
        operation: failure.operation,
        state: failure.state,
        retryable: failure.retryable,
      });
    }
  }

  if (pageProbePassed) {
    try {
      const pageId = firstCollectionId(pageProbe);
      if (pageId) await args.provider.readInstagramAccounts(args.connection, pageId);
      await recordAdvertisingValidation(db, {
        connectionId: args.connection.id,
        operation: "instagram_read",
        status: "passed",
        sanitizedCode: pageId ? "meta_instagram_read_available" : "meta_no_instagram_asset",
        metadata: { state: pageId ? "valid" : "no_data" },
      });
      diagnostics.push({
        operation: "instagram_read",
        state: pageId ? "valid" : "no_data",
        retryable: false,
      });
    } catch (error) {
      const failure = await recordFailure(db, args.connection.id, "instagram_read", error);
      diagnostics.push({
        operation: failure.operation,
        state: failure.state,
        retryable: failure.retryable,
      });
    }
  }
  const accountDiscoveryState = accounts.length ? "valid" : "no_data";
  await recordAdvertisingValidation(db, {
    connectionId: args.connection.id,
    operation: "account_discovery",
    status: "passed",
    sanitizedCode: accounts.length ? "meta_accounts_discovered" : "meta_no_accounts",
    metadata: { count: accounts.length, state: accountDiscoveryState },
  });
  diagnostics.push({
    operation: "account_discovery",
    state: accountDiscoveryState,
    retryable: false,
  });
  const status = diagnostics.some((diagnostic) => diagnostic.state !== "valid")
    ? ("partial" as const)
    : ("passed" as const);
  return { status, diagnostics, accounts };
}

function firstCollectionId(value: unknown): string | null {
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { data?: unknown }).data)
      ? (value as { data: unknown[] }).data
      : [];
  const first = rows[0];
  return first && typeof first === "object" && typeof (first as { id?: unknown }).id === "string"
    ? (first as { id: string }).id
    : null;
}

function capabilityForOperation(
  operation:
    | "campaign_read"
    | "adset_read"
    | "ad_read"
    | "creative_read"
    | "daily_insights_read"
    | "breakdown_read",
) {
  const capabilities = {
    campaign_read: "read_campaigns",
    adset_read: "read_adsets",
    ad_read: "read_ads",
    creative_read: "read_creatives",
    daily_insights_read: "read_reports",
    breakdown_read: "read_reports",
  } as const;
  return capabilities[operation];
}

type DiscoveredMetaSocialIdentity = {
  identityType: "facebook_page" | "instagram_business";
  externalIdentityId: string;
  displayName: string | null;
  username: string | null;
  parentExternalIdentityId: string | null;
};

/** Extract only stable identity fields from the bounded Page probe response. */
export function extractMetaSocialIdentities(value: unknown): DiscoveredMetaSocialIdentity[] {
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { data?: unknown }).data)
      ? (value as { data: unknown[] }).data
      : [];
  const identities: DiscoveredMetaSocialIdentity[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const page = row as {
      id?: unknown;
      name?: unknown;
      instagram_business_account?: unknown;
    };
    if (typeof page.id !== "string" || page.id.length === 0) continue;
    identities.push({
      identityType: "facebook_page",
      externalIdentityId: page.id,
      displayName: typeof page.name === "string" ? page.name : null,
      username: null,
      parentExternalIdentityId: null,
    });
    const instagram = page.instagram_business_account;
    if (!instagram || typeof instagram !== "object" || Array.isArray(instagram)) continue;
    const profile = instagram as { id?: unknown; name?: unknown; username?: unknown };
    if (typeof profile.id !== "string" || profile.id.length === 0) continue;
    identities.push({
      identityType: "instagram_business",
      externalIdentityId: profile.id,
      displayName:
        typeof profile.name === "string"
          ? profile.name
          : typeof profile.username === "string"
            ? profile.username
            : null,
      username: typeof profile.username === "string" ? profile.username : null,
      parentExternalIdentityId: page.id,
    });
  }
  return identities;
}

function recentDateRange() {
  const until = new Date();
  const since = new Date(until.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    since: since.toISOString().slice(0, 10),
    until: until.toISOString().slice(0, 10),
  };
}

export { providerFailure as classifyMetaDiagnostic };
