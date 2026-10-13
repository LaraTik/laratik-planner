import type {
  AdvertisingAuthorizationDecision,
  AdvertisingAuthorizationInput,
  AdvertisingCapability,
  AdvertisingOperation,
  AdvertisingVisibilityGrant,
} from "./types";

const OPERATION_CAPABILITY: Record<AdvertisingOperation, AdvertisingCapability> = {
  account_discovery: "discover_accounts",
  campaign_read: "read_campaigns",
  adset_read: "read_adsets",
  ad_read: "read_ads",
  creative_read: "read_creatives",
  report_read: "read_reports",
  financial_read: "read_financials",
  grant_manage: "manage_visibility_grants",
  diagnostics: "run_diagnostics",
  ai_context: "use_ai_context",
  export: "export_reports",
};
const FINANCIAL_OPERATIONS = new Set<AdvertisingOperation>(["financial_read", "export"]);
function isActive(
  start: string,
  end: string | null,
  revokedAt: string | null,
  now: number,
): boolean {
  return (
    revokedAt === null &&
    Date.parse(start) <= now &&
    now < (end === null ? Number.POSITIVE_INFINITY : Date.parse(end))
  );
}
function grantMatches(
  grant: AdvertisingVisibilityGrant,
  input: AdvertisingAuthorizationInput,
  now: number,
): boolean {
  const principal = input.principal;
  const account = input.account;
  return Boolean(
    principal &&
    account &&
    grant.agencyId === principal.agencyId &&
    grant.agencyId === account.agencyId &&
    grant.accountId === account.id &&
    grant.capability === OPERATION_CAPABILITY[input.operation] &&
    (!input.resource?.campaignId ||
      grant.campaignIds === null ||
      grant.campaignIds.includes(input.resource.campaignId)) &&
    (!input.resource?.adSetId ||
      grant.adSetIds === null ||
      grant.adSetIds.includes(input.resource.adSetId)) &&
    (!input.resource?.adId || grant.adIds === null || grant.adIds.includes(input.resource.adId)) &&
    (grant.workspaceId === null || grant.workspaceId === principal.workspaceId) &&
    isActive(grant.startsAt, grant.endsAt, grant.revokedAt, now),
  );
}

/** Central deny-by-default decision point. Provider adapters must not implement another policy. */
export function authorizeAdvertising(
  input: AdvertisingAuthorizationInput,
): AdvertisingAuthorizationDecision {
  const { principal, account, connection } = input;
  if (!principal) return { allowed: false, reason: "missing_principal" };
  if (!connection) return { allowed: false, reason: "missing_connection" };
  if (connection.agencyId !== principal.agencyId)
    return { allowed: false, reason: "agency_mismatch" };
  if (connection.status !== "active") return { allowed: false, reason: "connection_not_active" };
  if (!principal.capabilities.includes(OPERATION_CAPABILITY[input.operation]))
    return { allowed: false, reason: "capability_missing" };
  if (input.operation === "account_discovery" || input.operation === "diagnostics")
    return { allowed: true, reason: "allowed" };
  if (!account) return { allowed: false, reason: "missing_account" };
  if (account.agencyId !== principal.agencyId || account.status !== "active")
    return { allowed: false, reason: "agency_mismatch" };
  const now = Date.parse(input.now ?? new Date().toISOString());
  if (!input.visibilityGrants.some((grant) => grantMatches(grant, input, now)))
    return { allowed: false, reason: "visibility_grant_missing" };
  if (
    FINANCIAL_OPERATIONS.has(input.operation) &&
    !input.financialAuthorities.some(
      (authority) =>
        authority.accountId === account.id &&
        authority.agencyId === principal.agencyId &&
        (authority.workspaceId === null || authority.workspaceId === principal.workspaceId) &&
        isActive(authority.startsAt, authority.endsAt, authority.revokedAt, now),
    )
  )
    return { allowed: false, reason: "financial_authority_missing" };
  return { allowed: true, reason: "allowed" };
}
export { OPERATION_CAPABILITY };
