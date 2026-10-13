import type { db as appDb } from "@/lib/db";
import {
  activateAdvertisingConnection,
  persistDiscoveredAdvertisingAccount,
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
  operation: "diagnostics" | "account_discovery" | "campaign_read",
  error: unknown,
): Promise<MetaDiagnostic> {
  const failure = providerFailure(error);
  await recordAdvertisingValidation(db, {
    connectionId,
    operation,
    status: failure.retryable ? "unavailable" : "failed",
    sanitizedCode: failure.code,
    retryable: failure.retryable,
    metadata: { state: failure.state },
  });
  return { operation, state: failure.state, retryable: failure.retryable };
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
    diagnostics.push(await recordFailure(db, args.connection.id, "diagnostics", error));
    return { status: "failed" as const, diagnostics, accounts: [] as const };
  }

  let discovered: readonly AdvertisingAccount[];
  try {
    discovered = await args.provider.discoverAccounts(args.connection);
  } catch (error) {
    diagnostics.push(await recordFailure(db, args.connection.id, "account_discovery", error));
    return { status: "partial" as const, diagnostics, accounts: [] as const };
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
    try {
      await args.provider.readCampaigns(args.connection, accountView);
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
    } catch (error) {
      diagnostics.push(await recordFailure(db, args.connection.id, "campaign_read", error));
    }
  }
  await recordAdvertisingValidation(db, {
    connectionId: args.connection.id,
    operation: "account_discovery",
    status: "passed",
    sanitizedCode: accounts.length ? "meta_accounts_discovered" : "meta_no_accounts",
    metadata: { count: accounts.length, state: accounts.length ? "valid" : "no_data" },
  });
  return { status: "passed" as const, diagnostics, accounts };
}

export { providerFailure as classifyMetaDiagnostic };
