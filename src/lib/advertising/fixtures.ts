import type {
  AdvertisingAccount,
  AdvertisingConnection,
  AdvertisingFinancialAuthority,
  AdvertisingPrincipal,
  AdvertisingVisibilityGrant,
} from "./types";
export interface AdvertisingIsolationFixture {
  readonly agencies: readonly string[];
  readonly workspaces: readonly string[];
  readonly accounts: readonly AdvertisingAccount[];
  readonly connections: readonly AdvertisingConnection[];
  readonly principals: readonly AdvertisingPrincipal[];
  readonly grants: readonly AdvertisingVisibilityGrant[];
  readonly financialAuthorities: readonly AdvertisingFinancialAuthority[];
  readonly campaigns: readonly { id: string; accountId: string; workspaceId: string | null }[];
}
/** Synthetic fixture for cross-agency, shared-account, revoked-grant, and unallocated-campaign tests. */
export function createAdvertisingIsolationFixture(): AdvertisingIsolationFixture {
  const agencyA = "agency-a";
  const agencyB = "agency-b";
  const workspaceA1 = "workspace-a1";
  const workspaceA2 = "workspace-a2";
  const workspaceB1 = "workspace-b1";
  const account = (id: string, agencyId: string, connectionId: string): AdvertisingAccount => ({
    id,
    provider: "meta",
    externalAccountId: `act_${id}`,
    agencyId,
    name: id,
    currency: "EUR",
    timezone: "Europe/Berlin",
    connectionId,
    status: "active",
  });
  const connection = (id: string, agencyId: string): AdvertisingConnection => ({
    id,
    provider: "meta",
    agencyId,
    credentialRef: `credential:${id}`,
    status: "active",
    lastValidatedAt: "2026-10-01T00:00:00.000Z",
  });
  return {
    agencies: [agencyA, agencyB],
    workspaces: [workspaceA1, workspaceA2, workspaceB1],
    accounts: [
      account("shared-account", agencyA, "connection-a"),
      account("private-account-b", agencyB, "connection-b"),
    ],
    connections: [connection("connection-a", agencyA), connection("connection-b", agencyB)],
    principals: [
      {
        userId: "user-a1",
        agencyId: agencyA,
        workspaceId: workspaceA1,
        capabilities: ["read_reports", "read_financials", "export_reports", "use_ai_context"],
        supportAccessAgencyId: null,
      },
      {
        userId: "user-a2",
        agencyId: agencyA,
        workspaceId: workspaceA2,
        capabilities: ["read_reports", "read_financials"],
        supportAccessAgencyId: null,
      },
      {
        userId: "user-b1",
        agencyId: agencyB,
        workspaceId: workspaceB1,
        capabilities: ["read_reports", "read_financials"],
        supportAccessAgencyId: null,
      },
    ],
    grants: [
      {
        id: "grant-a1",
        agencyId: agencyA,
        workspaceId: workspaceA1,
        accountId: "shared-account",
        campaignIds: ["campaign-a"],
        adSetIds: null,
        adIds: null,
        capability: "read_reports",
        startsAt: "2026-01-01T00:00:00.000Z",
        endsAt: null,
        revokedAt: null,
      },
      {
        id: "grant-a1-financial",
        agencyId: agencyA,
        workspaceId: workspaceA1,
        accountId: "shared-account",
        campaignIds: null,
        adSetIds: null,
        adIds: null,
        capability: "read_financials",
        startsAt: "2026-01-01T00:00:00.000Z",
        endsAt: null,
        revokedAt: null,
      },
      {
        id: "grant-a2-revoked",
        agencyId: agencyA,
        workspaceId: workspaceA2,
        accountId: "shared-account",
        campaignIds: ["campaign-b"],
        adSetIds: null,
        adIds: null,
        capability: "read_reports",
        startsAt: "2026-01-01T00:00:00.000Z",
        endsAt: null,
        revokedAt: "2026-09-01T00:00:00.000Z",
      },
      {
        id: "grant-b1",
        agencyId: agencyB,
        workspaceId: workspaceB1,
        accountId: "private-account-b",
        campaignIds: ["campaign-b-agency"],
        adSetIds: null,
        adIds: null,
        capability: "read_reports",
        startsAt: "2026-01-01T00:00:00.000Z",
        endsAt: null,
        revokedAt: null,
      },
    ],
    financialAuthorities: [
      {
        id: "financial-a1",
        agencyId: agencyA,
        workspaceId: workspaceA1,
        accountId: "shared-account",
        startsAt: "2026-01-01T00:00:00.000Z",
        endsAt: null,
        revokedAt: null,
      },
    ],
    campaigns: [
      { id: "campaign-a", accountId: "shared-account", workspaceId: workspaceA1 },
      { id: "campaign-b", accountId: "shared-account", workspaceId: null },
      { id: "campaign-b-agency", accountId: "private-account-b", workspaceId: workspaceB1 },
    ],
  };
}
