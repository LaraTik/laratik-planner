/** Provider-neutral advertising contracts. Identity, visibility, and financial authority are separate by design. */
export type AdvertisingProvider = "meta";
export type AdvertisingOperation =
  | "account_discovery"
  | "campaign_read"
  | "adset_read"
  | "ad_read"
  | "creative_read"
  | "report_read"
  | "financial_read"
  | "grant_manage"
  | "diagnostics"
  | "ai_context"
  | "export";
export type AdvertisingCapability =
  | "discover_accounts"
  | "read_campaigns"
  | "read_adsets"
  | "read_ads"
  | "read_creatives"
  | "read_reports"
  | "read_financials"
  | "manage_visibility_grants"
  | "run_diagnostics"
  | "use_ai_context"
  | "export_reports";
export type AdvertisingConnectionStatus = "active" | "revoked" | "invalid";

export interface AdvertisingAccount {
  readonly id: string;
  readonly provider: AdvertisingProvider;
  readonly externalAccountId: string;
  readonly agencyId: string;
  readonly name: string;
  readonly currency: string;
  readonly timezone: string;
  readonly connectionId: string;
  readonly status: AdvertisingConnectionStatus;
}
export interface AdvertisingConnection {
  readonly id: string;
  readonly provider: AdvertisingProvider;
  readonly agencyId: string;
  readonly credentialRef: string;
  readonly status: AdvertisingConnectionStatus;
  readonly lastValidatedAt: string | null;
}
export interface AdvertisingVisibilityGrant {
  readonly id: string;
  readonly agencyId: string;
  readonly workspaceId: string | null;
  readonly accountId: string;
  readonly campaignIds: readonly string[] | null;
  readonly adSetIds: readonly string[] | null;
  readonly adIds: readonly string[] | null;
  readonly capability: AdvertisingCapability;
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly revokedAt: string | null;
}
export interface AdvertisingFinancialAuthority {
  readonly id: string;
  readonly agencyId: string;
  readonly workspaceId: string | null;
  readonly accountId: string;
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly revokedAt: string | null;
}
export interface AdvertisingReportContext {
  readonly definitionVersion: string;
  readonly provider: AdvertisingProvider;
  readonly accountId: string;
  readonly currency: string;
  readonly timezone: string;
  readonly dateRange: { readonly since: string; readonly until: string };
  readonly attributionWindow: string | null;
  readonly actionReportTime: string | null;
  readonly breakdowns: readonly string[];
  readonly grain: "account_day" | "campaign_day" | "adset_day" | "ad_day";
}
export interface AdvertisingPrincipal {
  readonly userId: string;
  readonly agencyId: string;
  readonly workspaceId: string | null;
  readonly capabilities: readonly AdvertisingCapability[];
  readonly supportAccessAgencyId: string | null;
}
export interface AdvertisingResourceRef {
  readonly campaignId?: string;
  readonly adSetId?: string;
  readonly adId?: string;
}
export interface AdvertisingAuthorizationInput {
  readonly principal: AdvertisingPrincipal | null;
  readonly operation: AdvertisingOperation;
  readonly account: AdvertisingAccount | null;
  readonly connection: AdvertisingConnection | null;
  readonly visibilityGrants: readonly AdvertisingVisibilityGrant[];
  readonly financialAuthorities: readonly AdvertisingFinancialAuthority[];
  readonly resource?: AdvertisingResourceRef;
  readonly now?: string;
}
export interface AdvertisingAuthorizationDecision {
  readonly allowed: boolean;
  readonly reason:
    | "allowed"
    | "missing_principal"
    | "missing_account"
    | "missing_connection"
    | "connection_not_active"
    | "agency_mismatch"
    | "workspace_mismatch"
    | "capability_missing"
    | "visibility_grant_missing"
    | "financial_authority_missing"
    | "grant_expired";
}
